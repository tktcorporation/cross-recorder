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
    mockSaveChunk = vi.fn().mockResolvedValue({ success: true, bytesWritten: 1024 });
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
    mockSaveChunk.mockResolvedValueOnce({ success: false, bytesWritten: 0 });
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
      .mockResolvedValue({ success: true, bytesWritten: 512 });

    const buffer = new ArrayBuffer(512);
    await writer.enqueue("s1", "mic", buffer);
    await writer.enqueue("s1", "mic", buffer);
    await writer.flush();

    // Only first chunk attempted, second dropped after error
    expect(mockSaveChunk).toHaveBeenCalledTimes(1);
  });

  it("tracks totalBytes from successful writes", async () => {
    mockSaveChunk
      .mockResolvedValueOnce({ success: true, bytesWritten: 1024 })
      .mockResolvedValueOnce({ success: true, bytesWritten: 2048 });

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
});
