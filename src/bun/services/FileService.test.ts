import { describe, it, expect, afterEach, vi } from "vitest";
import { Effect } from "effect";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { APP_DATA_DIR, RECORDINGS_DIR } from "../../shared/constants.js";
import type { RecordingConfig } from "../../shared/types.js";
import {
  startSession,
  writeChunkSync,
  finalizeRecording,
  cancelSession,
  clampChunkForTrack,
  isCheckpointDue,
  MAX_WAV_DATA_SIZE,
  HEADER_CHECKPOINT_INTERVAL_MS,
} from "./FileService.js";

const recordingsDir = path.join(os.homedir(), APP_DATA_DIR, RECORDINGS_DIR);

const config: RecordingConfig = {
  sampleRate: 48000,
  channels: 1,
  bitDepth: 16,
  micEnabled: true,
  systemAudioEnabled: false,
  micDeviceId: null,
};

/**
 * テストで Effect を実行するためのヘルパー。
 * Effect.runPromise は素の reject で失敗を伝えるが、oxlint のカスタムルール
 * (effect/no-runpromise-without-catch) がサービス層での素の runPromise を
 * 禁止しているため、runPromiseExit で結果を受け取り、失敗時はテストが
 * わかりやすく落ちるよう明示的に throw する。
 */
async function runOrThrow<A, E>(effect: Effect.Effect<A, E>): Promise<A> {
  const exit = await Effect.runPromiseExit(effect);
  if (exit._tag === "Failure") {
    throw new Error(`Effect failed: ${String(exit.cause)}`);
  }
  return exit.value;
}

/** WAV ヘッダーの data サブチャンクサイズ (offset 40, 32bit LE) を直接読む。 */
function readDataSizeFromHeader(filePath: string): number {
  return fs.readFileSync(filePath).readUInt32LE(40);
}

describe("FileService — pure helpers", () => {
  describe("clampChunkForTrack", () => {
    it("returns the full chunk length when well under the limit", () => {
      expect(clampChunkForTrack(0, 1000, 10_000)).toBe(1000);
    });

    it("truncates the chunk to exactly fill the remaining space", () => {
      expect(clampChunkForTrack(9990, 100, 10_000)).toBe(10);
    });

    it("returns 0 once the track is already at the limit", () => {
      expect(clampChunkForTrack(10_000, 100, 10_000)).toBe(0);
    });

    it("returns 0 if bytesWritten somehow already exceeds the limit", () => {
      expect(clampChunkForTrack(10_050, 100, 10_000)).toBe(0);
    });

    it("clamps at the real MAX_WAV_DATA_SIZE boundary (32-bit WAV limit)", () => {
      expect(clampChunkForTrack(MAX_WAV_DATA_SIZE - 5, 10)).toBe(5);
      expect(clampChunkForTrack(MAX_WAV_DATA_SIZE, 10)).toBe(0);
    });

    it("does not truncate a chunk that fits, even if its length isn't a multiple of frameSize", () => {
      // frameSize alignment must only apply to the truncation boundary,
      // never to a normal write — otherwise every non-frame-aligned chunk
      // from the native capture path would silently lose bytes.
      expect(clampChunkForTrack(0, 7, 10_000, 4)).toBe(7);
    });

    it("aligns a truncated chunk down to a whole sample frame", () => {
      // 4 bytes/frame (e.g. stereo 16-bit): remaining=10 must not cut
      // mid-frame, so it rounds down to 8.
      expect(clampChunkForTrack(9990, 100, 10_000, 4)).toBe(8);
    });

    it("returns exactly the remaining bytes when they already land on a frame boundary", () => {
      expect(clampChunkForTrack(9988, 100, 10_000, 4)).toBe(12);
    });
  });

  describe("isCheckpointDue", () => {
    it("is not due before the interval elapses", () => {
      expect(isCheckpointDue(1000, 1000 + HEADER_CHECKPOINT_INTERVAL_MS - 1)).toBe(false);
    });

    it("is due exactly at the interval boundary", () => {
      expect(isCheckpointDue(1000, 1000 + HEADER_CHECKPOINT_INTERVAL_MS)).toBe(true);
    });

    it("is due once the interval has elapsed", () => {
      expect(isCheckpointDue(1000, 1000 + HEADER_CHECKPOINT_INTERVAL_MS + 500)).toBe(true);
    });
  });
});

describe("FileService — session lifecycle (real filesystem)", () => {
  const createdDirs: string[] = [];

  function trackForCleanup(dir: string) {
    createdDirs.push(dir);
  }

  afterEach(() => {
    vi.useRealTimers();
    for (const dir of createdDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("checkpoints the header mid-recording so the file is valid even before finalize (crash resilience)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const sessionId = `test-checkpoint-${crypto.randomUUID()}`;
    trackForCleanup(path.join(recordingsDir, sessionId));

    await runOrThrow(
      startSession(sessionId, config, [{ trackKind: "mic", channels: 1 }]),
    );

    const chunk1 = Buffer.alloc(100, 1);
    writeChunkSync(sessionId, "mic", chunk1);

    // Immediately after the first chunk, the checkpoint interval has not
    // elapsed yet — the on-disk header should still say 0 bytes.
    const filePath = path.join(recordingsDir, sessionId, "mic.wav");
    expect(readDataSizeFromHeader(filePath)).toBe(0);

    // Advance past the checkpoint interval and write another chunk.
    vi.setSystemTime(HEADER_CHECKPOINT_INTERVAL_MS + 1);
    const chunk2 = Buffer.alloc(50, 2);
    writeChunkSync(sessionId, "mic", chunk2);

    // Without ever calling finalizeRecording, the header on disk must
    // already reflect the real byte count — this is what protects a
    // recording if the process crashes right now.
    expect(readDataSizeFromHeader(filePath)).toBe(
      chunk1.length + chunk2.length,
    );

    await runOrThrow(cancelSession(sessionId));
  });

  it("does not throw on a normal write, and the real size-cap boundary math is covered by the clampChunkForTrack unit tests above (writing 4GiB in a test is impractical)", async () => {
    const sessionId = `test-cap-${crypto.randomUUID()}`;
    trackForCleanup(path.join(recordingsDir, sessionId));

    await runOrThrow(
      startSession(sessionId, config, [{ trackKind: "mic", channels: 1 }]),
    );

    expect(() => writeChunkSync(sessionId, "mic", Buffer.alloc(10))).not.toThrow();

    await runOrThrow(cancelSession(sessionId));
  });

  it("a zero-length chunk is a no-op and does not falsely trigger the size-limit warning", async () => {
    const sessionId = `test-zero-chunk-${crypto.randomUUID()}`;
    trackForCleanup(path.join(recordingsDir, sessionId));

    await runOrThrow(
      startSession(sessionId, config, [{ trackKind: "mic", channels: 1 }]),
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // An empty buffer (e.g. a zero-byte stdout read from the native
    // capture subprocess) must not be mistaken for "track hit the 32-bit
    // size limit" — that would permanently suppress the real warning.
    writeChunkSync(sessionId, "mic", Buffer.alloc(0));
    expect(warnSpy).not.toHaveBeenCalled();

    // A normal write afterward must still work and be recorded correctly.
    const chunk = Buffer.alloc(50, 7);
    writeChunkSync(sessionId, "mic", chunk);

    const metadata = await runOrThrow(
      finalizeRecording(sessionId, config, { mic: 2, system: 0 }),
    );
    trackForCleanup(metadata.filePath);
    expect(readDataSizeFromHeader(path.join(metadata.filePath, "mic.wav"))).toBe(
      chunk.length,
    );

    warnSpy.mockRestore();
  });

  it("finalizeRecording writes the exact final byte count and never throws for a normal track", async () => {
    const sessionId = `test-finalize-${crypto.randomUUID()}`;
    trackForCleanup(path.join(recordingsDir, sessionId));

    await runOrThrow(
      startSession(sessionId, config, [{ trackKind: "mic", channels: 1 }]),
    );

    const chunk1 = Buffer.alloc(200, 3);
    const chunk2 = Buffer.alloc(300, 4);
    writeChunkSync(sessionId, "mic", chunk1);
    writeChunkSync(sessionId, "mic", chunk2);

    const metadata = await runOrThrow(
      finalizeRecording(sessionId, config, { mic: 2, system: 0 }),
    );
    trackForCleanup(metadata.filePath);

    const finalizedPath = path.join(metadata.filePath, "mic.wav");
    expect(readDataSizeFromHeader(finalizedPath)).toBe(
      chunk1.length + chunk2.length,
    );
    expect(metadata.tracks[0]?.fileSizeBytes).toBe(
      44 + chunk1.length + chunk2.length,
    );
  });

  it("finalizeRecording writes the header from session.config, not the caller-supplied config parameter", async () => {
    const sessionId = `test-config-source-${crypto.randomUUID()}`;
    trackForCleanup(path.join(recordingsDir, sessionId));

    await runOrThrow(
      startSession(sessionId, config, [{ trackKind: "mic", channels: 1 }]),
    );

    writeChunkSync(sessionId, "mic", Buffer.alloc(100, 5));

    // A config that disagrees with what startSession stored — if
    // finalizeRecording used this parameter for the header instead of
    // session.config (the single source of truth checkpointHeaders reads
    // from), the final header would silently diverge from the periodic
    // checkpoints written throughout the recording.
    const divergentConfig: RecordingConfig = { ...config, sampleRate: 44100 };
    const metadata = await runOrThrow(
      finalizeRecording(sessionId, divergentConfig, { mic: 1, system: 0 }),
    );
    trackForCleanup(metadata.filePath);

    const finalizedPath = path.join(metadata.filePath, "mic.wav");
    const headerSampleRate = fs.readFileSync(finalizedPath).readUInt32LE(24);
    expect(headerSampleRate).toBe(config.sampleRate);
  });
});
