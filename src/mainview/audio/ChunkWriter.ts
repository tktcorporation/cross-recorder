// src/mainview/audio/ChunkWriter.ts

import type { TrackKind } from "@shared/types.js";

interface ChunkData {
  sessionId: string;
  trackKind: TrackKind;
  chunkIndex: number;
  pcmData: string; // base64
}

interface SaveChunkResponse {
  success: boolean;
  bytesWritten: number;
}

interface ChunkWriterOptions {
  saveChunk: (data: ChunkData) => Promise<SaveChunkResponse>;
  onError: (reason: string) => void;
}

interface QueueEntry {
  sessionId: string;
  trackKind: TrackKind;
  pcmData: string;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export class ChunkWriter {
  private queue: QueueEntry[] = [];
  private flushing = false;
  private errored = false;
  private chunkIndices: Map<TrackKind, number> = new Map();
  private totalBytes = 0;
  private readonly saveChunk: ChunkWriterOptions["saveChunk"];
  private readonly onError: ChunkWriterOptions["onError"];

  constructor(options: ChunkWriterOptions) {
    this.saveChunk = options.saveChunk;
    this.onError = options.onError;
  }

  async enqueue(
    sessionId: string,
    trackKind: TrackKind,
    pcmBuffer: ArrayBuffer,
  ): Promise<void> {
    if (this.errored) return;
    const pcmData = arrayBufferToBase64(pcmBuffer);
    this.queue.push({ sessionId, trackKind, pcmData });
    if (!this.flushing) {
      await this.processQueue();
    }
  }

  async flush(): Promise<void> {
    if (!this.flushing) {
      await this.processQueue();
    }
  }

  getTotalBytes(): number {
    return this.totalBytes;
  }

  getChunkCounts(): Record<string, number> {
    return Object.fromEntries(this.chunkIndices);
  }

  reset(): void {
    this.queue = [];
    this.flushing = false;
    this.errored = false;
    this.chunkIndices.clear();
    this.totalBytes = 0;
  }

  private async processQueue(): Promise<void> {
    this.flushing = true;
    while (this.queue.length > 0 && !this.errored) {
      const entry = this.queue.shift()!;
      const chunkIndex = this.chunkIndices.get(entry.trackKind) ?? 0;
      this.chunkIndices.set(entry.trackKind, chunkIndex + 1);

      try {
        const result = await this.saveChunk({
          sessionId: entry.sessionId,
          trackKind: entry.trackKind,
          chunkIndex,
          pcmData: entry.pcmData,
        });
        if (!result.success) {
          this.errored = true;
          this.queue = [];
          this.onError("chunk_write_failed");
          break;
        }
        this.totalBytes += result.bytesWritten;
      } catch {
        this.errored = true;
        this.queue = [];
        this.onError("chunk_write_failed");
        break;
      }
    }
    this.flushing = false;
  }
}
