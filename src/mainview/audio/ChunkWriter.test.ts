// src/mainview/audio/ChunkWriter.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChunkWriter } from "./ChunkWriter.js";

describe("ChunkWriter", () => {
  let writer: ChunkWriter;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockSaveChunk: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockOnError: any;

  beforeEach(() => {
    mockSaveChunk = vi.fn().mockResolvedValue({ success: true, chunkSizeBytes: 1024 });
    mockOnError = vi.fn();
    writer = new ChunkWriter({
      saveChunk: mockSaveChunk,
      onError: mockOnError,
    });
  });

  it("sends chunks to saveChunk with correct parameters", async () => {
    const buffer = new ArrayBuffer(1024);
    await writer.enqueue("session-1", "mic", buffer);
    await writer.flush();

    expect(mockSaveChunk).toHaveBeenCalledWith({
      sessionId: "session-1",
      trackKind: "mic",
      chunkIndex: 0,
      pcmData: expect.any(String), // base64
    });
  });

  it("increments chunkIndex per track", async () => {
    const buffer = new ArrayBuffer(512);
    await writer.enqueue("s1", "mic", buffer);
    await writer.enqueue("s1", "mic", buffer);
    await writer.flush();

    expect(mockSaveChunk).toHaveBeenCalledTimes(2);
    expect(mockSaveChunk.mock.calls[0]![0].chunkIndex).toBe(0);
    expect(mockSaveChunk.mock.calls[1]![0].chunkIndex).toBe(1);
  });

  it("tracks separate chunkIndex per trackKind", async () => {
    const buffer = new ArrayBuffer(512);
    await writer.enqueue("s1", "mic", buffer);
    await writer.enqueue("s1", "system", buffer);
    await writer.flush();

    const micCall = mockSaveChunk.mock.calls.find(
      (c: any[]) => c[0].trackKind === "mic",
    );
    const sysCall = mockSaveChunk.mock.calls.find(
      (c: any[]) => c[0].trackKind === "system",
    );
    expect(micCall![0].chunkIndex).toBe(0);
    expect(sysCall![0].chunkIndex).toBe(0);
  });

  it("calls onError when saveChunk returns success: false", async () => {
    mockSaveChunk.mockResolvedValueOnce({ success: false, chunkSizeBytes: 0 });
    const buffer = new ArrayBuffer(512);
    await writer.enqueue("s1", "mic", buffer);
    await writer.flush();

    expect(mockOnError).toHaveBeenCalledWith("chunk_write_failed");
  });

  it("calls onError when saveChunk throws", async () => {
    mockSaveChunk.mockRejectedValueOnce(new Error("RPC timeout"));
    const buffer = new ArrayBuffer(512);
    await writer.enqueue("s1", "mic", buffer);
    await writer.flush();

    expect(mockOnError).toHaveBeenCalledWith("chunk_write_failed");
  });

  it("stops processing queue after error", async () => {
    mockSaveChunk
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue({ success: true, chunkSizeBytes: 512 });

    const buffer = new ArrayBuffer(512);
    await writer.enqueue("s1", "mic", buffer);
    await writer.enqueue("s1", "mic", buffer);
    await writer.flush();

    // Only first chunk attempted, second dropped after error
    expect(mockSaveChunk).toHaveBeenCalledTimes(1);
  });

  it("tracks totalBytes from successful writes", async () => {
    mockSaveChunk
      .mockResolvedValueOnce({ success: true, chunkSizeBytes: 1024 })
      .mockResolvedValueOnce({ success: true, chunkSizeBytes: 2048 });

    const buffer = new ArrayBuffer(512);
    await writer.enqueue("s1", "mic", buffer);
    await writer.enqueue("s1", "mic", buffer);
    await writer.flush();

    expect(writer.getTotalBytes()).toBe(3072);
  });

  it("resets state on reset()", () => {
    writer.reset();
    expect(writer.getTotalBytes()).toBe(0);
  });

  it("flush waits for an in-flight response and queued chunks on both tracks", async () => {
    let completeWrite!: (result: { success: boolean; chunkSizeBytes: number }) => void;
    mockSaveChunk.mockImplementationOnce(() => new Promise((resolve) => { completeWrite = resolve; }));
    const first = writer.enqueue("s1", "system", new ArrayBuffer(4));
    await writer.enqueue("s1", "mic", new ArrayBuffer(6));
    let flushed = false;
    const flush = writer.flush().then(() => { flushed = true; });
    await Promise.resolve();
    expect(flushed).toBe(false);
    expect(mockSaveChunk).toHaveBeenCalledTimes(1);
    completeWrite({ success: true, chunkSizeBytes: 4 });
    await Promise.all([first, flush]);
    expect(flushed).toBe(true);
    expect(mockSaveChunk).toHaveBeenCalledTimes(2);
    expect(mockSaveChunk.mock.calls[1][0].trackKind).toBe("mic");
  });

  it("discard drops queued chunks and waits for the in-flight response", async () => {
    let completeWrite!: (result: { success: boolean; chunkSizeBytes: number }) => void;
    mockSaveChunk.mockImplementationOnce(() => new Promise((resolve) => { completeWrite = resolve; }));
    const first = writer.enqueue("old", "mic", new ArrayBuffer(4));
    await writer.enqueue("old", "system", new ArrayBuffer(6));
    let discarded = false;
    const discard = writer.discard().then(() => { discarded = true; });
    await Promise.resolve();
    expect(discarded).toBe(false);
    await writer.enqueue("old", "mic", new ArrayBuffer(8));
    completeWrite({ success: true, chunkSizeBytes: 4 });
    await Promise.all([first, discard]);
    expect(mockSaveChunk).toHaveBeenCalledTimes(1);
    expect(mockOnError).not.toHaveBeenCalled();
  });
});
