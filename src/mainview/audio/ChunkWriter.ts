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
  /** Size of this individual chunk in bytes (not cumulative total). */
  chunkSizeBytes: number;
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
  private drainPromise: Promise<void> | null = null;
  private closed = false;
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
    if (this.errored || this.closed) return;
    const pcmData = arrayBufferToBase64(pcmBuffer);
    this.queue.push({ sessionId, trackKind, pcmData });
    if (!this.drainPromise) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    // A limit notification can start finalization before saveChunk responds.
    // Join the existing drain, including every chunk queued before capture stops.
    do {
      await this.ensureDrain();
    } while (this.drainPromise || this.queue.length > 0);
  }

  async discard(): Promise<void> {
    this.closed = true;
    this.queue = [];
    // Do not delete the session underneath an outstanding RPC write.
    await this.drainPromise;
  }

  getTotalBytes(): number {
    return this.totalBytes;
  }

  getChunkCounts(): Record<string, number> {
    return Object.fromEntries(this.chunkIndices);
  }

  reset(): void {
    this.queue = [];
    this.closed = false;
    this.errored = false;
    this.chunkIndices.clear();
    this.totalBytes = 0;
  }

  private async processQueue(): Promise<void> {
    while (this.queue.length > 0 && !this.errored && !this.closed) {
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
          if (!this.closed) this.onError("chunk_write_failed");
          break;
        }
        this.totalBytes += result.chunkSizeBytes;
      } catch {
        this.errored = true;
        this.queue = [];
        if (!this.closed) this.onError("chunk_write_failed");
        break;
      }
    }
  }

  private ensureDrain(): Promise<void> {
    if (!this.drainPromise) {
      this.drainPromise = Promise.resolve()
        .then(() => this.processQueue())
        .finally(() => {
          this.drainPromise = null;
          // An enqueue may land between the drain's last await and this cleanup.
          if (this.queue.length > 0 && !this.errored && !this.closed) {
            void this.flush();
          }
        });
    }
    return this.drainPromise;
  }
}
