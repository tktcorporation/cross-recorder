// src/bun/services/NativeSystemAudioCapture.ts
//
// Manages a native Swift subprocess that captures system audio via
// ScreenCaptureKit on macOS. PCM data is read from stdout and written
// to the WAV file through the provided callback.

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

let activeCapture: ActiveCapture | null = null;

function findBinaryPath(): string | null {
  // Development: project root / build / native
  const devPath = path.join(
    process.cwd(),
    "build",
    "native",
    "capture-system-audio",
  );
  if (fs.existsSync(devPath)) return devPath;

  // Production: relative to the bun entry (inside app bundle)
  const prodPath = path.resolve(
    import.meta.dir,
    "..",
    "..",
    "native",
    "capture-system-audio",
  );
  if (fs.existsSync(prodPath)) return prodPath;

  return null;
}

/** Whether native system audio capture is available on this platform. */
export function isAvailable(): boolean {
  return process.platform === "darwin" && findBinaryPath() !== null;
}

/** Whether a capture is currently running (optionally for a specific session). */
export function isActive(sessionId?: string): boolean {
  if (!activeCapture) return false;
  if (sessionId) return activeCapture.sessionId === sessionId;
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
export async function start(
  sessionId: string,
  sampleRate: number,
  writeChunk: WriteChunkFn,
  onLevel?: LevelCallback,
  onError?: ErrorCallback,
): Promise<void> {
  if (activeCapture) {
    throw new Error("Native system audio capture is already active");
  }

  const binaryPath = findBinaryPath();
  if (!binaryPath) {
    throw new Error("Native system audio capture binary not found");
  }

  const proc = Bun.spawn(
    [binaryPath, "--sample-rate", String(sampleRate), "--channels", "2"],
    { stdout: "pipe", stderr: "pipe" },
  );

  activeCapture = { process: proc, sessionId, onLevel, onError };

  // Wait for the first status message from stderr to confirm startup
  const decoder = new TextDecoder();
  const stderrReader = (proc.stderr as ReadableStream<Uint8Array>).getReader();
  let stderrBuffer = "";

  const firstMsg = await readNextMessage(stderrReader, decoder, stderrBuffer);
  stderrBuffer = firstMsg.remaining;

  if (firstMsg.message.error) {
    activeCapture = null;
    proc.kill();
    throw new Error(String(firstMsg.message.error));
  }

  if (firstMsg.message.status !== "started") {
    activeCapture = null;
    proc.kill();
    throw new Error(
      `Unexpected native capture status: ${JSON.stringify(firstMsg.message)}`,
    );
  }

  // Start background readers for ongoing stderr (levels) and stdout (PCM data)
  readStderrLoop(stderrReader, decoder, stderrBuffer);
  readStdoutLoop(
    (proc.stdout as ReadableStream<Uint8Array>).getReader(),
    writeChunk,
  );
}

/** Stop any active capture, waiting for the subprocess to exit. */
export async function stop(): Promise<void> {
  if (!activeCapture) return;

  const proc = activeCapture.process;
  activeCapture = null;

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
export async function stopIfActive(sessionId?: string): Promise<void> {
  if (isActive(sessionId)) {
    await stop();
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function readNextMessage(
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

function readStderrLoop(
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
              activeCapture?.onLevel?.(msg.level as number);
            }
            if (typeof msg.error === "string") {
              activeCapture?.onError?.(msg.error as string);
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

function readStdoutLoop(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  writeChunk: WriteChunkFn,
): void {
  void (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!activeCapture) break;
        writeChunk(Buffer.from(value));
      }
    } catch {
      /* stream closed */
    }
  })();
}
