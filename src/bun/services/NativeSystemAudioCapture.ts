// src/bun/services/NativeSystemAudioCapture.ts
//
// Manages a native subprocess that captures system audio.
// - macOS: Swift binary using ScreenCaptureKit
// - Linux: Shell script using PipeWire (pw-cat) or PulseAudio (parec)
//
// PCM data is read from stdout and written to the WAV file through the
// provided callback. Status/level/error messages arrive as JSON on stderr.

import * as fs from "node:fs";
import * as path from "node:path";

type WriteChunkFn = (buffer: Buffer) => void;
type LevelCallback = (level: number) => void;
type ErrorCallback = (reason: string) => void;

interface ActiveCapture {
  process: ReturnType<typeof Bun.spawn>;
  sessionId: string;
  onLevel?: LevelCallback;
  onError?: ErrorCallback;
}

export class NativeSystemAudioCapture {
  private capture: ActiveCapture | null = null;

  /**
   * プラットフォームに応じたキャプチャバイナリ/スクリプトのパスを探す。
   * macOS: コンパイル済み Swift バイナリ (capture-system-audio)
   * Linux: シェルスクリプト (capture-system-audio.sh)
   */
  private static findBinaryPath(): string | null {
    const binaryName =
      process.platform === "linux"
        ? "capture-system-audio.sh"
        : "capture-system-audio";

    // Development: project root / build / native
    const devPath = path.join(process.cwd(), "build", "native", binaryName);
    if (fs.existsSync(devPath)) return devPath;

    // Production: relative to the bun entry (inside app bundle)
    const prodPath = path.resolve(
      import.meta.dir,
      "..",
      "..",
      "native",
      binaryName,
    );
    if (fs.existsSync(prodPath)) return prodPath;

    return null;
  }

  /**
   * ネイティブシステム音声キャプチャがこのプラットフォームで利用可能か。
   * macOS: ScreenCaptureKit バイナリの存在チェック
   * Linux: PipeWire/PulseAudio スクリプトの存在チェック
   */
  static isAvailable(): boolean {
    const supported =
      process.platform === "darwin" || process.platform === "linux";
    return supported && NativeSystemAudioCapture.findBinaryPath() !== null;
  }

  /**
   * Run a preflight check to verify ScreenCaptureKit access and permissions.
   * Returns { ok: true } or { ok: false, reason: string }.
   */
  static async checkPermission(): Promise<{
    ok: boolean;
    reason?: string;
  }> {
    const binaryPath = NativeSystemAudioCapture.findBinaryPath();
    if (!binaryPath) {
      return { ok: false, reason: "Native capture binary not found" };
    }

    const proc = Bun.spawn([binaryPath, "--check"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const decoder = new TextDecoder();
    let stderr = "";

    const stderrReader = (proc.stderr as ReadableStream<Uint8Array>).getReader();
    try {
      for (;;) {
        const { value, done } = await stderrReader.read();
        if (done) break;
        stderr += decoder.decode(value, { stream: true });
      }
    } catch {
      /* stream closed */
    }

    await proc.exited;

    // Parse the last JSON line from stderr
    const lines = stderr.trim().split("\n");
    for (const line of lines.reverse()) {
      try {
        const msg = JSON.parse(line) as Record<string, unknown>;
        if (msg.check === "ok") return { ok: true };
        if (msg.check === "error") {
          return { ok: false, reason: String(msg.reason ?? "Unknown error") };
        }
      } catch {
        /* skip non-JSON */
      }
    }

    return {
      ok: false,
      reason: `Preflight check failed (exit code: ${proc.exitCode})`,
    };
  }

  /** Whether a capture is currently running (optionally for a specific session). */
  isActive(sessionId?: string): boolean {
    if (!this.capture) return false;
    if (sessionId) return this.capture.sessionId === sessionId;
    return true;
  }

  /**
   * Start native system audio capture.
   *
   * @param sessionId  Recording session ID (used for bookkeeping)
   * @param sampleRate Sample rate in Hz (e.g. 48000)
   * @param writeChunk Called with raw PCM Int16LE buffers to write to the WAV file
   * @param onLevel    Called periodically with the RMS audio level (0..1)
   * @param onError    Called if the subprocess reports an error or crashes
   */
  async start(
    sessionId: string,
    sampleRate: number,
    writeChunk: WriteChunkFn,
    onLevel?: LevelCallback,
    onError?: ErrorCallback,
  ): Promise<void> {
    if (this.capture) {
      throw new Error("Native system audio capture is already active");
    }

    const binaryPath = NativeSystemAudioCapture.findBinaryPath();
    if (!binaryPath) {
      throw new Error("Native system audio capture binary not found");
    }

    const proc = Bun.spawn(
      [binaryPath, "--sample-rate", String(sampleRate), "--channels", "2"],
      { stdout: "pipe", stderr: "pipe" },
    );

    this.capture = { process: proc, sessionId, onLevel, onError };

    // Wait for the first status message from stderr to confirm startup
    const decoder = new TextDecoder();
    const stderrReader = (proc.stderr as ReadableStream<Uint8Array>).getReader();
    let stderrBuffer = "";

    const firstMsg = await this.readNextMessage(stderrReader, decoder, stderrBuffer);
    stderrBuffer = firstMsg.remaining;

    if (firstMsg.message.error) {
      this.capture = null;
      proc.kill();
      throw new Error(String(firstMsg.message.error));
    }

    if (firstMsg.message.status !== "started") {
      this.capture = null;
      proc.kill();
      throw new Error(
        `Unexpected native capture status: ${JSON.stringify(firstMsg.message)}`,
      );
    }

    // Start background readers for ongoing stderr (levels) and stdout (PCM data)
    this.readStderrLoop(stderrReader, decoder, stderrBuffer);
    this.readStdoutLoop(
      (proc.stdout as ReadableStream<Uint8Array>).getReader(),
      writeChunk,
    );
  }

  /** Stop any active capture, waiting for the subprocess to exit. */
  async stop(): Promise<void> {
    if (!this.capture) return;

    const proc = this.capture.process;
    this.capture = null;

    proc.kill("SIGTERM");

    // Wait for exit with a timeout
    const exitPromise = proc.exited;
    const timeoutPromise = new Promise<void>((resolve) =>
      setTimeout(resolve, 3000),
    );
    await Promise.race([exitPromise, timeoutPromise]);

    if (proc.exitCode === null) {
      proc.kill("SIGKILL");
    }
  }

  /** Convenience: stop only if there is an active capture (optionally for a session). */
  async stopIfActive(sessionId?: string): Promise<void> {
    if (this.isActive(sessionId)) {
      await this.stop();
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async readNextMessage(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    decoder: TextDecoder,
    buffer: string,
  ): Promise<{ message: Record<string, unknown>; remaining: string }> {
    let buf = buffer;

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error("Timeout waiting for native capture process to start"),
          ),
        10_000,
      ),
    );

    const read = async (): Promise<{
      message: Record<string, unknown>;
      remaining: string;
    }> => {
      for (;;) {
        const newlineIdx = buf.indexOf("\n");
        if (newlineIdx >= 0) {
          const line = buf.slice(0, newlineIdx).trim();
          buf = buf.slice(newlineIdx + 1);
          if (line) {
            try {
              return {
                message: JSON.parse(line) as Record<string, unknown>,
                remaining: buf,
              };
            } catch {
              /* skip non-JSON lines */
            }
          }
        }

        const { value, done } = await reader.read();
        if (done) throw new Error("Native capture process exited unexpectedly");
        buf += decoder.decode(value, { stream: true });
      }
    };

    return Promise.race([read(), timeout]);
  }

  private readStderrLoop(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    decoder: TextDecoder,
    initialBuffer: string,
  ): void {
    let buffer = initialBuffer;

    void (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          let newlineIdx: number;
          while ((newlineIdx = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newlineIdx).trim();
            buffer = buffer.slice(newlineIdx + 1);

            if (!line) continue;
            try {
              const msg = JSON.parse(line) as Record<string, unknown>;
              if (typeof msg.level === "number") {
                this.capture?.onLevel?.(msg.level as number);
              }
              if (typeof msg.error === "string") {
                this.capture?.onError?.(msg.error as string);
              }
            } catch {
              /* skip */
            }
          }
        }
      } catch {
        /* stream closed */
      }
    })();
  }

  private readStdoutLoop(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    writeChunk: WriteChunkFn,
  ): void {
    void (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!this.capture) break;
          writeChunk(Buffer.from(value));
        }
      } catch {
        /* stream closed */
      }
    })();
  }
}
