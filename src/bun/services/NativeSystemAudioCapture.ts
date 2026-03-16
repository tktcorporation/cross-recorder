// src/bun/services/NativeSystemAudioCapture.ts
//
// Manages a native subprocess that captures system audio.
// プラットフォーム固有の差異（バイナリ名、エラーメッセージ等）は
// PlatformCaptureConfig に集約し、ビジネスロジックをプラットフォーム非依存に保つ。
//
// PCM data is read from stdout and written to the WAV file through the
// provided callback. Status/level/error messages arrive as JSON on stderr.

import * as fs from "node:fs";
import * as path from "node:path";

type WriteChunkFn = (buffer: Buffer) => void;
type LevelCallback = (level: number) => void;
type ErrorCallback = (reason: string) => void;

// ---------------------------------------------------------------------------
// プラットフォーム定義
// ---------------------------------------------------------------------------

/**
 * プラットフォーム固有のキャプチャ設定。
 * 新しいプラットフォーム対応時はここに定義を追加するだけでよい。
 */
interface PlatformCaptureConfig {
  /** build/native 配下のバイナリ/スクリプトのファイル名 */
  binaryName: string;
  /** checkPermission 失敗時にユーザーに表示するガイダンス */
  permissionDeniedHint: string;
}

/**
 * プラットフォームごとのキャプチャ設定マップ。
 *
 * macOS: ScreenCaptureKit (Swift コンパイル済みバイナリ)
 * Linux: PipeWire/PulseAudio (シェルスクリプト)
 *
 * Windows は現在 WebView2 の getDisplayMedia で対応しており、
 * ネイティブキャプチャは未実装。対応時はここに追加する。
 */
const PLATFORM_CONFIGS: Partial<Record<NodeJS.Platform, PlatformCaptureConfig>> = {
  darwin: {
    binaryName: "capture-system-audio",
    permissionDeniedHint:
      "システム設定 > プライバシーとセキュリティ > 画面収録 で権限を許可してください。",
  },
  linux: {
    binaryName: "capture-system-audio.sh",
    permissionDeniedHint:
      "PipeWire (pw-cat) または PulseAudio (parec) がインストールされ、動作していることを確認してください。",
  },
};

// ---------------------------------------------------------------------------

interface ActiveCapture {
  process: ReturnType<typeof Bun.spawn>;
  sessionId: string;
  onLevel?: LevelCallback;
  onError?: ErrorCallback;
}

export class NativeSystemAudioCapture {
  private capture: ActiveCapture | null = null;

  /** 現在のプラットフォームに対応する設定を返す。未対応なら null。 */
  private static getPlatformConfig(): PlatformCaptureConfig | null {
    return PLATFORM_CONFIGS[process.platform] ?? null;
  }

  /**
   * キャプチャバイナリ/スクリプトのパスを探す。
   * 開発時は build/native、本番時はアプリバンドル内の native ディレクトリを探索する。
   */
  private static findBinaryPath(): string | null {
    const config = NativeSystemAudioCapture.getPlatformConfig();
    if (!config) return null;

    // Development: project root / build / native
    const devPath = path.join(process.cwd(), "build", "native", config.binaryName);
    if (fs.existsSync(devPath)) return devPath;

    // Production: relative to the bun entry (inside app bundle)
    const prodPath = path.resolve(
      import.meta.dir,
      "..",
      "..",
      "native",
      config.binaryName,
    );
    if (fs.existsSync(prodPath)) return prodPath;

    return null;
  }

  /** ネイティブシステム音声キャプチャがこのプラットフォームで利用可能か。 */
  static isAvailable(): boolean {
    return NativeSystemAudioCapture.findBinaryPath() !== null;
  }

  /**
   * プリフライトチェック: キャプチャバイナリの起動可否と権限を確認する。
   * 失敗時の reason にはプラットフォーム適切なガイダンスが含まれる。
   */
  static async checkPermission(): Promise<{
    ok: boolean;
    reason?: string;
    hint?: string;
  }> {
    const config = NativeSystemAudioCapture.getPlatformConfig();
    const binaryPath = NativeSystemAudioCapture.findBinaryPath();
    if (!binaryPath || !config) {
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
          return {
            ok: false,
            reason: String(msg.reason ?? "Unknown error"),
            hint: config.permissionDeniedHint,
          };
        }
      } catch {
        /* skip non-JSON */
      }
    }

    return {
      ok: false,
      reason: `Preflight check failed (exit code: ${proc.exitCode})`,
      hint: config.permissionDeniedHint,
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

    // Start background readers for ongoing stderr (errors) and stdout (PCM data + level)
    this.readStderrLoop(stderrReader, decoder, stderrBuffer);
    this.readStdoutLoop(
      (proc.stdout as ReadableStream<Uint8Array>).getReader(),
      writeChunk,
      sampleRate,
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

  /**
   * stderr からの JSON メッセージを処理する（エラー通知のみ）。
   * レベル報告は readStdoutLoop で PCM データから直接計算するため、
   * ネイティブバイナリ/スクリプト側での level 実装は不要。
   */
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
              if (typeof msg.error === "string") {
                this.capture?.onError?.(msg.error as string);
              }
            } catch {
              /* skip non-JSON lines */
            }
          }
        }
      } catch {
        /* stream closed */
      }
    })();
  }

  /**
   * stdout から PCM Int16LE データを読み、writeChunk に渡す。
   * 同時に RMS レベルを計算し、~100ms ごとに onLevel コールバックに報告する。
   *
   * レベル計算をここで行うことで、ネイティブバイナリ/スクリプト側は
   * 「PCM を stdout に出す」だけに専念でき、プラットフォーム間で一貫した
   * レベル報告が得られる。
   */
  private readStdoutLoop(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    writeChunk: WriteChunkFn,
    sampleRate: number,
  ): void {
    // ~100ms ごとにレベルを報告するためのサンプル数閾値
    // (サンプルレート / 10) で約100msぶんのサンプル
    const levelReportInterval = Math.floor(sampleRate / 10);
    let squareSum = 0;
    let sampleCount = 0;

    void (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!this.capture) break;

          writeChunk(Buffer.from(value));

          // PCM Int16LE のサンプルから RMS レベルを計算
          const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
          const numSamples = Math.floor(value.byteLength / 2);
          for (let i = 0; i < numSamples; i++) {
            const sample = view.getInt16(i * 2, true) / 32768;
            squareSum += sample * sample;
            sampleCount++;
          }

          if (sampleCount >= levelReportInterval) {
            const rms = Math.sqrt(squareSum / sampleCount);
            // rms * 2 で見やすい範囲にスケール（macOS Swift 実装と同じ）
            const level = Math.min(1, rms * 2);
            this.capture?.onLevel?.(level);
            squareSum = 0;
            sampleCount = 0;
          }
        }
      } catch {
        /* stream closed */
      }
    })();
  }
}
