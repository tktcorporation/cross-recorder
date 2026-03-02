# 録音システム ステートマシン再設計 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 録音システムの状態管理をステートマシンで再構築し、エラー伝播・リソースクリーンアップを統一する

**Architecture:** RecordingSession クラスがステートマシンとして全状態遷移を管理。ChunkWriter が RPC 書き込みを await で順序保証。useRecording は RecordingSession の subscribe + dispatch のみに簡素化。

**Tech Stack:** TypeScript, Vitest, Web Audio API, Zustand, Electrobun RPC

---

## Task 1: 型定義の作成

**Files:**
- Create: `src/mainview/audio/types.ts`
- Modify: `src/shared/types.ts`

**Step 1: 型定義ファイルを作成**

```typescript
// src/mainview/audio/types.ts

import type { TrackKind } from "@shared/types.js";

// ── Session State (Discriminated Union) ──

export type SessionState =
  | { type: "idle" }
  | { type: "acquiring"; requestedTracks: TrackKind[] }
  | {
      type: "recording";
      sessionId: string;
      activeTracks: TrackKind[];
      startTime: number;
    }
  | {
      type: "degraded";
      sessionId: string;
      activeTracks: TrackKind[];
      lostTracks: TrackKind[];
      startTime: number;
    }
  | { type: "stopping"; sessionId: string }
  | { type: "error"; message: string; lastSessionId?: string };

// ── Session Events ──

export type SessionEvent =
  | { type: "START"; requestedTracks: TrackKind[] }
  | { type: "ACQUIRED"; sessionId: string; tracks: TrackKind[] }
  | { type: "TRACK_LOST"; track: TrackKind }
  | { type: "ALL_TRACKS_LOST" }
  | { type: "STOP" }
  | { type: "FINALIZED" }
  | { type: "ERROR"; reason: string }
  | { type: "DISMISS" };

// ── Event Emitter Types ──

export type SessionEventMap = {
  stateChange: (state: SessionState) => void;
  error: (error: { reason: string; state: SessionState }) => void;
};
```

**Step 2: TrackKind が shared/types.ts に既に存在することを確認**

`src/shared/types.ts` に `TrackKind = "mic" | "system"` が既に定義されている。追加変更不要。

**Step 3: Commit**

```
feat: 録音ステートマシンの型定義を追加
```

---

## Task 2: RecordingSession ステートマシンのテスト作成

**Files:**
- Create: `src/mainview/audio/RecordingSession.test.ts`

**Step 1: 状態遷移の基本テストを書く**

```typescript
// src/mainview/audio/RecordingSession.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RecordingSession } from "./RecordingSession.js";
import type { SessionState, SessionEvent } from "./types.js";

describe("RecordingSession", () => {
  let session: RecordingSession;
  let stateChanges: SessionState[];

  beforeEach(() => {
    session = new RecordingSession();
    stateChanges = [];
    session.on("stateChange", (state) => stateChanges.push(state));
  });

  describe("initial state", () => {
    it("starts in idle state", () => {
      expect(session.getState()).toEqual({ type: "idle" });
    });
  });

  describe("idle → acquiring", () => {
    it("transitions to acquiring on START", () => {
      session.dispatch({ type: "START", requestedTracks: ["mic"] });
      expect(session.getState()).toEqual({
        type: "acquiring",
        requestedTracks: ["mic"],
      });
    });

    it("emits stateChange event", () => {
      session.dispatch({ type: "START", requestedTracks: ["mic"] });
      expect(stateChanges).toHaveLength(1);
      expect(stateChanges[0]).toEqual({
        type: "acquiring",
        requestedTracks: ["mic"],
      });
    });

    it("ignores STOP in idle state", () => {
      session.dispatch({ type: "STOP" });
      expect(session.getState()).toEqual({ type: "idle" });
      expect(stateChanges).toHaveLength(0);
    });
  });

  describe("acquiring → recording", () => {
    it("transitions to recording on ACQUIRED", () => {
      session.dispatch({ type: "START", requestedTracks: ["mic", "system"] });
      session.dispatch({
        type: "ACQUIRED",
        sessionId: "test-session",
        tracks: ["mic", "system"],
      });
      const state = session.getState();
      expect(state.type).toBe("recording");
      if (state.type === "recording") {
        expect(state.sessionId).toBe("test-session");
        expect(state.activeTracks).toEqual(["mic", "system"]);
        expect(state.startTime).toBeGreaterThan(0);
      }
    });
  });

  describe("acquiring → error", () => {
    it("transitions to error on ERROR", () => {
      session.dispatch({ type: "START", requestedTracks: ["mic"] });
      session.dispatch({ type: "ERROR", reason: "Permission denied" });
      expect(session.getState()).toEqual({
        type: "error",
        message: "Permission denied",
        lastSessionId: undefined,
      });
    });
  });

  describe("recording → degraded", () => {
    it("transitions to degraded when one track is lost", () => {
      session.dispatch({ type: "START", requestedTracks: ["mic", "system"] });
      session.dispatch({
        type: "ACQUIRED",
        sessionId: "s1",
        tracks: ["mic", "system"],
      });
      session.dispatch({ type: "TRACK_LOST", track: "system" });
      const state = session.getState();
      expect(state.type).toBe("degraded");
      if (state.type === "degraded") {
        expect(state.activeTracks).toEqual(["mic"]);
        expect(state.lostTracks).toEqual(["system"]);
      }
    });
  });

  describe("recording → stopping", () => {
    it("transitions to stopping on STOP", () => {
      session.dispatch({ type: "START", requestedTracks: ["mic"] });
      session.dispatch({
        type: "ACQUIRED",
        sessionId: "s1",
        tracks: ["mic"],
      });
      session.dispatch({ type: "STOP" });
      expect(session.getState()).toEqual({
        type: "stopping",
        sessionId: "s1",
      });
    });
  });

  describe("recording with single track → TRACK_LOST", () => {
    it("transitions directly to stopping when only track is lost", () => {
      session.dispatch({ type: "START", requestedTracks: ["mic"] });
      session.dispatch({
        type: "ACQUIRED",
        sessionId: "s1",
        tracks: ["mic"],
      });
      session.dispatch({ type: "TRACK_LOST", track: "mic" });
      expect(session.getState()).toEqual({
        type: "stopping",
        sessionId: "s1",
      });
    });
  });

  describe("degraded → stopping", () => {
    it("transitions to stopping on STOP", () => {
      session.dispatch({ type: "START", requestedTracks: ["mic", "system"] });
      session.dispatch({
        type: "ACQUIRED",
        sessionId: "s1",
        tracks: ["mic", "system"],
      });
      session.dispatch({ type: "TRACK_LOST", track: "system" });
      session.dispatch({ type: "STOP" });
      expect(session.getState()).toEqual({
        type: "stopping",
        sessionId: "s1",
      });
    });

    it("transitions to stopping on ALL_TRACKS_LOST", () => {
      session.dispatch({ type: "START", requestedTracks: ["mic", "system"] });
      session.dispatch({
        type: "ACQUIRED",
        sessionId: "s1",
        tracks: ["mic", "system"],
      });
      session.dispatch({ type: "TRACK_LOST", track: "system" });
      session.dispatch({ type: "ALL_TRACKS_LOST" });
      expect(session.getState()).toEqual({
        type: "stopping",
        sessionId: "s1",
      });
    });
  });

  describe("stopping → idle", () => {
    it("transitions to idle on FINALIZED", () => {
      session.dispatch({ type: "START", requestedTracks: ["mic"] });
      session.dispatch({
        type: "ACQUIRED",
        sessionId: "s1",
        tracks: ["mic"],
      });
      session.dispatch({ type: "STOP" });
      session.dispatch({ type: "FINALIZED" });
      expect(session.getState()).toEqual({ type: "idle" });
    });
  });

  describe("stopping → error", () => {
    it("transitions to error on ERROR with lastSessionId", () => {
      session.dispatch({ type: "START", requestedTracks: ["mic"] });
      session.dispatch({
        type: "ACQUIRED",
        sessionId: "s1",
        tracks: ["mic"],
      });
      session.dispatch({ type: "STOP" });
      session.dispatch({ type: "ERROR", reason: "Finalize failed" });
      expect(session.getState()).toEqual({
        type: "error",
        message: "Finalize failed",
        lastSessionId: "s1",
      });
    });
  });

  describe("error → idle", () => {
    it("transitions to idle on DISMISS", () => {
      session.dispatch({ type: "START", requestedTracks: ["mic"] });
      session.dispatch({ type: "ERROR", reason: "test" });
      session.dispatch({ type: "DISMISS" });
      expect(session.getState()).toEqual({ type: "idle" });
    });
  });

  describe("invalid transitions are ignored", () => {
    it("ignores START when not idle", () => {
      session.dispatch({ type: "START", requestedTracks: ["mic"] });
      session.dispatch({
        type: "ACQUIRED",
        sessionId: "s1",
        tracks: ["mic"],
      });
      session.dispatch({ type: "START", requestedTracks: ["system"] });
      expect(session.getState().type).toBe("recording");
    });

    it("ignores ACQUIRED when not acquiring", () => {
      session.dispatch({
        type: "ACQUIRED",
        sessionId: "s1",
        tracks: ["mic"],
      });
      expect(session.getState()).toEqual({ type: "idle" });
    });
  });

  describe("recording → stopping on ERROR", () => {
    it("transitions to stopping on ERROR to save data", () => {
      session.dispatch({ type: "START", requestedTracks: ["mic"] });
      session.dispatch({
        type: "ACQUIRED",
        sessionId: "s1",
        tracks: ["mic"],
      });
      session.dispatch({ type: "ERROR", reason: "AudioContext closed" });
      expect(session.getState()).toEqual({
        type: "stopping",
        sessionId: "s1",
      });
    });
  });
});
```

**Step 2: テストを実行して失敗を確認**

Run: `npx vitest run src/mainview/audio/RecordingSession.test.ts`
Expected: FAIL — `RecordingSession` モジュールが存在しない

**Step 3: Commit**

```
test: RecordingSession ステートマシンの遷移テストを追加
```

---

## Task 3: RecordingSession ステートマシンの実装

**Files:**
- Create: `src/mainview/audio/RecordingSession.ts`

**Step 1: ステートマシン本体を実装**

```typescript
// src/mainview/audio/RecordingSession.ts

import type { SessionState, SessionEvent, SessionEventMap } from "./types.js";

type Listener<T extends keyof SessionEventMap> = SessionEventMap[T];

export class RecordingSession {
  private state: SessionState = { type: "idle" };
  private listeners: Map<string, Set<Function>> = new Map();

  getState(): SessionState {
    return this.state;
  }

  dispatch(event: SessionEvent): void {
    const nextState = this.transition(this.state, event);
    if (nextState === null) return; // invalid transition, ignore
    this.state = nextState;
    this.emit("stateChange", nextState);
  }

  on<T extends keyof SessionEventMap>(
    event: T,
    listener: Listener<T>,
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
    return () => {
      this.listeners.get(event)?.delete(listener);
    };
  }

  private emit<T extends keyof SessionEventMap>(
    event: T,
    ...args: Parameters<SessionEventMap[T]>
  ): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        (listener as Function)(...args);
      }
    }
  }

  private transition(
    current: SessionState,
    event: SessionEvent,
  ): SessionState | null {
    switch (current.type) {
      case "idle":
        return this.fromIdle(event);
      case "acquiring":
        return this.fromAcquiring(event);
      case "recording":
        return this.fromRecording(current, event);
      case "degraded":
        return this.fromDegraded(current, event);
      case "stopping":
        return this.fromStopping(current, event);
      case "error":
        return this.fromError(event);
      default:
        return null;
    }
  }

  private fromIdle(event: SessionEvent): SessionState | null {
    if (event.type === "START") {
      return { type: "acquiring", requestedTracks: event.requestedTracks };
    }
    return null;
  }

  private fromAcquiring(event: SessionEvent): SessionState | null {
    if (event.type === "ACQUIRED") {
      return {
        type: "recording",
        sessionId: event.sessionId,
        activeTracks: event.tracks,
        startTime: Date.now(),
      };
    }
    if (event.type === "ERROR") {
      return {
        type: "error",
        message: event.reason,
        lastSessionId: undefined,
      };
    }
    return null;
  }

  private fromRecording(
    current: Extract<SessionState, { type: "recording" }>,
    event: SessionEvent,
  ): SessionState | null {
    if (event.type === "TRACK_LOST") {
      const remaining = current.activeTracks.filter((t) => t !== event.track);
      if (remaining.length === 0) {
        return { type: "stopping", sessionId: current.sessionId };
      }
      return {
        type: "degraded",
        sessionId: current.sessionId,
        activeTracks: remaining,
        lostTracks: [event.track],
        startTime: current.startTime,
      };
    }
    if (event.type === "STOP") {
      return { type: "stopping", sessionId: current.sessionId };
    }
    if (event.type === "ERROR") {
      return { type: "stopping", sessionId: current.sessionId };
    }
    return null;
  }

  private fromDegraded(
    current: Extract<SessionState, { type: "degraded" }>,
    event: SessionEvent,
  ): SessionState | null {
    if (event.type === "TRACK_LOST") {
      const remaining = current.activeTracks.filter((t) => t !== event.track);
      if (remaining.length === 0) {
        return { type: "stopping", sessionId: current.sessionId };
      }
      return {
        ...current,
        activeTracks: remaining,
        lostTracks: [...current.lostTracks, event.track],
      };
    }
    if (event.type === "STOP" || event.type === "ALL_TRACKS_LOST") {
      return { type: "stopping", sessionId: current.sessionId };
    }
    if (event.type === "ERROR") {
      return { type: "stopping", sessionId: current.sessionId };
    }
    return null;
  }

  private fromStopping(
    current: Extract<SessionState, { type: "stopping" }>,
    event: SessionEvent,
  ): SessionState | null {
    if (event.type === "FINALIZED") {
      return { type: "idle" };
    }
    if (event.type === "ERROR") {
      return {
        type: "error",
        message: event.reason,
        lastSessionId: current.sessionId,
      };
    }
    return null;
  }

  private fromError(event: SessionEvent): SessionState | null {
    if (event.type === "DISMISS") {
      return { type: "idle" };
    }
    return null;
  }
}
```

**Step 2: テストを実行して全て PASS を確認**

Run: `npx vitest run src/mainview/audio/RecordingSession.test.ts`
Expected: ALL PASS

**Step 3: Commit**

```
feat: RecordingSession ステートマシンを実装
```

---

## Task 4: ChunkWriter のテスト作成

**Files:**
- Create: `src/mainview/audio/ChunkWriter.test.ts`

**Step 1: ChunkWriter のテストを書く**

```typescript
// src/mainview/audio/ChunkWriter.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChunkWriter } from "./ChunkWriter.js";
import type { TrackKind } from "@shared/types.js";

describe("ChunkWriter", () => {
  let writer: ChunkWriter;
  let mockSaveChunk: ReturnType<typeof vi.fn>;
  let mockOnError: ReturnType<typeof vi.fn>;

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
    expect(mockSaveChunk.mock.calls[0][0].chunkIndex).toBe(0);
    expect(mockSaveChunk.mock.calls[1][0].chunkIndex).toBe(1);
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
    expect(micCall[0].chunkIndex).toBe(0);
    expect(sysCall[0].chunkIndex).toBe(0);
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
```

**Step 2: テストを実行して失敗を確認**

Run: `npx vitest run src/mainview/audio/ChunkWriter.test.ts`
Expected: FAIL — `ChunkWriter` モジュールが存在しない

**Step 3: Commit**

```
test: ChunkWriter のテストを追加
```

---

## Task 5: ChunkWriter の実装

**Files:**
- Create: `src/mainview/audio/ChunkWriter.ts`

**Step 1: ChunkWriter を実装**

```typescript
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
    binary += String.fromCharCode(bytes[i]);
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
```

**Step 2: テストを実行して全て PASS を確認**

Run: `npx vitest run src/mainview/audio/ChunkWriter.test.ts`
Expected: ALL PASS

**Step 3: Commit**

```
feat: ChunkWriter を実装（RPC書き込みのキュー化+エラー伝播）
```

---

## Task 6: SystemAudioCapture のエラーハンドリング改善

**Files:**
- Modify: `src/mainview/audio/SystemAudioCapture.ts`
- Modify: `src/mainview/audio/SystemAudioCapture.test.ts`

**Step 1: テストを追加 — applyConstraints 失敗時のエラー伝播**

`SystemAudioCapture.test.ts` に以下のテストを追加:

```typescript
it("throws when applyConstraints fails for all audio tracks", async () => {
  const mockTrack = {
    kind: "audio",
    stop: vi.fn(),
    applyConstraints: vi.fn().mockRejectedValue(new Error("Constraint error")),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  mockGetDisplayMedia.mockResolvedValue({
    getAudioTracks: () => [mockTrack],
    getVideoTracks: () => [],
    getTracks: () => [mockTrack],
  });

  const capture = new SystemAudioCapture();
  await expect(capture.start()).rejects.toThrow();
});
```

**Step 2: テストを実行して失敗を確認**

Run: `npx vitest run src/mainview/audio/SystemAudioCapture.test.ts`
Expected: FAIL — 現在は silent catch のため throw されない

**Step 3: SystemAudioCapture.ts を修正**

`applyConstraints` の catch ブロックで silent continue → throw に変更:

```typescript
// 変更前: catch ブロックで何もしない
// 変更後: エラーを再throw
for (const track of this.stream.getAudioTracks()) {
  await track.applyConstraints({
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  });
}
```

**Step 4: テストを実行して全て PASS を確認**

Run: `npx vitest run src/mainview/audio/SystemAudioCapture.test.ts`
Expected: ALL PASS

**Step 5: onTrackEnded の登録タイミングを修正**

現在の実装: `start()` メソッド内で MediaStream 取得後にリスナーを登録
修正: 問題なし（start 内でストリーム取得直後に登録しているため、タイミング的に正しい。AudioCaptureManager 側での onTrackEnded コールバック登録を start 呼び出し前に行う必要がある — Task 8 で対応）

**Step 6: Commit**

```
fix: SystemAudioCapture の applyConstraints エラーを伝播するように修正
```

---

## Task 7: MicrophoneCapture のエラーハンドリング確認

**Files:**
- Review: `src/mainview/audio/MicrophoneCapture.ts`

**Step 1: MicrophoneCapture は既にエラーを throw している（getUserMedia の失敗は呼び出し元に伝播）**

追加の修正は不要。確認のみ。

---

## Task 8: RecordingPipeline の改善

**Files:**
- Modify: `src/mainview/audio/RecordingPipeline.ts`

**Step 1: AudioContext.resume() のエラーハンドリングを追加**

```typescript
// RecordingPipeline.ts の init() メソッド内
if (this.audioContext.state === "suspended") {
  try {
    await this.audioContext.resume();
  } catch (e) {
    throw new Error(
      `AudioContext の起動に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
if (this.audioContext.state !== "running") {
  throw new Error(
    `AudioContext が running 状態になりませんでした: ${this.audioContext.state}`,
  );
}
```

**Step 2: Worklet エラーリスナーを追加**

`addTrack()` メソッド内、worklet 作成後に追加:

```typescript
const worklet = new AudioWorkletNode(this.audioContext, "pcm-recorder", {
  numberOfInputs: 1,
  numberOfOutputs: 1,
  outputChannelCount: [channelCount],
});

// エラーリスナー追加
worklet.addEventListener("processorerror", (event) => {
  console.error(`[RecordingPipeline] Worklet error for ${trackKind}:`, event);
  this.onWorkletError?.(trackKind);
});
```

Pipeline に `onWorkletError` コールバックを追加:

```typescript
export class RecordingPipeline {
  onWorkletError?: (trackKind: TrackKind) => void;
  // ...
}
```

**Step 3: Commit**

```
fix: RecordingPipeline の AudioContext エラーハンドリングと Worklet エラーリスナーを追加
```

---

## Task 9: AudioCaptureManager のリファクタリング

**Files:**
- Modify: `src/mainview/audio/AudioCaptureManager.ts`
- Modify: `src/mainview/audio/AudioCaptureManager.test.ts`

これは最も大きな変更。AudioCaptureManager を RecordingSession + ChunkWriter と連携するように書き換える。

**Step 1: 既存テストを更新して新しいインターフェースに合わせる**

AudioCaptureManager のコンストラクタに RecordingSession と ChunkWriter のファクトリを注入するようにテストを更新。

**Step 2: AudioCaptureManager を修正**

主な変更点:
- `chunkIndex` の手動管理を削除（ChunkWriter が管理）
- `totalBytes` の手動管理を削除（ChunkWriter が管理）
- チャンク送信を `ChunkWriter.enqueue()` に委譲
- `onTrackEnded` コールバックを `start()` 呼び出し前に登録
- `stop()` と `cancel()` の共通部分を `cleanup()` に統一
- `arrayBufferToBase64` を ChunkWriter に移動済み

```typescript
// AudioCaptureManager.ts の主要な変更イメージ

import { ChunkWriter } from "./ChunkWriter.js";

export class AudioCaptureManager {
  private chunkWriter: ChunkWriter | null = null;
  // chunkIndex, totalBytes → 削除

  async start(config: RecordingConfig): Promise<void> {
    this.chunkWriter = new ChunkWriter({
      saveChunk: (data) => this.rpcRequest.saveRecordingChunk(data),
      onError: (reason) => this.onErrorCallback?.(reason),
    });

    // onTrackEnded を start() より前に登録
    this.systemCapture.onTrackEnded(() => {
      this.onTrackEndedCallback?.("system");
    });

    // ... 既存の start ロジック ...

    // パイプラインのチャンクコールバック
    pipeline.addTrack(trackKind, stream, (pcmBuffer) => {
      this.chunkWriter?.enqueue(this.sessionId!, trackKind, pcmBuffer);
    });
  }

  getTotalBytes(): number {
    return this.chunkWriter?.getTotalBytes() ?? 0;
  }

  private async cleanup(shouldFinalize: boolean): Promise<void> {
    this.pipeline?.stop();
    this.micCapture?.stop();
    this.systemCapture?.stop();

    if (shouldFinalize && this.sessionId) {
      await this.rpcRequest.finalizeRecording({ sessionId: this.sessionId });
    } else if (this.sessionId) {
      await this.rpcRequest.cancelRecording({ sessionId: this.sessionId });
    }

    this.chunkWriter?.reset();
    this.sessionId = null;
  }

  async stop(): Promise<RecordingMetadata> {
    return await this.cleanup(true);
  }

  async cancel(): Promise<void> {
    await this.cleanup(false);
  }
}
```

**Step 3: 全テストを実行して PASS を確認**

Run: `npx vitest run src/mainview/audio/AudioCaptureManager.test.ts`
Expected: ALL PASS

**Step 4: Commit**

```
refactor: AudioCaptureManager を ChunkWriter と連携するようにリファクタ
```

---

## Task 10: recordingStore の状態拡張

**Files:**
- Modify: `src/mainview/stores/recordingStore.ts`

**Step 1: ストアの状態を SessionState に合わせて拡張**

```typescript
// recordingStore.ts の変更

import type { SessionState } from "@audio/types.js";

interface RecordingStore {
  // 既存の recordingState を sessionState に置換
  sessionState: SessionState;
  // recordingState は sessionState から派生させる（後方互換）
  // "idle" | "recording" | "stopping" は UI コンポーネントが参照するため維持

  // 新規追加
  setSessionState: (state: SessionState) => void;

  // 既存を維持
  // selectedMicId, devices, micEnabled, systemAudioEnabled, etc.
}
```

`recordingState` を使っている UI コンポーネントへの影響を最小化するため、`sessionState` から `recordingState` を導出するゲッターを用意:

```typescript
// セレクタとして外部で定義
export function selectRecordingState(state: SessionState): RecordingState {
  switch (state.type) {
    case "idle":
    case "error":
      return "idle";
    case "acquiring":
    case "recording":
    case "degraded":
      return "recording";
    case "stopping":
      return "stopping";
  }
}
```

**Step 2: Commit**

```
refactor: recordingStore に SessionState を追加し既存の recordingState と互換維持
```

---

## Task 11: useRecording フックの簡素化

**Files:**
- Modify: `src/mainview/hooks/useRecording.ts`

これが最終的な統合タスク。

**Step 1: useRecording を RecordingSession ベースに書き換え**

主要な変更:
- `startingRef`, `stoppingRef` を削除
- `RecordingSession` のインスタンスを `useRef` で保持
- `session.on("stateChange", ...)` でストアを更新
- `startRecording()` → `session.dispatch({ type: "START", ... })`
- `stopRecording()` → `session.dispatch({ type: "STOP" })`

```typescript
// useRecording.ts のリファクタ後のイメージ

export function useRecording() {
  const sessionRef = useRef<RecordingSession | null>(null);
  const managerRef = useRef<AudioCaptureManager | null>(null);

  const {
    sessionState,
    setSessionState,
    setCurrentSessionId,
    // ... 他の既存 state
  } = useRecordingStore();

  // RecordingSession の初期化
  useEffect(() => {
    const session = new RecordingSession();
    sessionRef.current = session;

    const unsub = session.on("stateChange", (state) => {
      setSessionState(state);
      // 状態に応じた副作用を実行
      handleStateTransition(state);
    });

    return () => {
      unsub();
      managerRef.current?.cancel();
    };
  }, []);

  async function handleStateTransition(state: SessionState) {
    switch (state.type) {
      case "acquiring":
        await acquireDevices(state.requestedTracks);
        break;
      case "stopping":
        await finalizeRecording(state.sessionId);
        break;
      // ...
    }
  }

  function startRecording() {
    const tracks: TrackKind[] = [];
    if (micEnabled) tracks.push("mic");
    if (systemAudioEnabled) tracks.push("system");
    sessionRef.current?.dispatch({ type: "START", requestedTracks: tracks });
  }

  function stopRecording() {
    sessionRef.current?.dispatch({ type: "STOP" });
  }

  return {
    recordingState: selectRecordingState(sessionState),
    sessionState,
    startRecording,
    stopRecording,
  };
}
```

**Step 2: 全テストを実行**

Run: `npx vitest run`
Expected: ALL PASS

**Step 3: Commit**

```
refactor: useRecording を RecordingSession ベースに簡素化
```

---

## Task 12: 統合テストと最終確認

**Files:**
- Run: 全テストスイート

**Step 1: 全テスト実行**

Run: `npx vitest run`
Expected: ALL PASS

**Step 2: TypeScript コンパイルチェック**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Changeset 作成**

```markdown
---
"cross-recorder": minor
---

録音システムのステートマシン再設計: 状態管理をステートマシンで再構築し、エラー伝播とリソースクリーンアップを統一
```

**Step 4: 最終コミット**

```
chore: changeset 追加
```

---

## 依存関係グラフ

```
Task 1 (types)
  ├── Task 2-3 (RecordingSession tests + impl)
  ├── Task 4-5 (ChunkWriter tests + impl)
  ├── Task 6-7 (Capture error handling)
  └── Task 8 (Pipeline improvement)
       ↓
Task 9 (AudioCaptureManager refactor) ← depends on 3, 5
       ↓
Task 10 (recordingStore) ← depends on 1
       ↓
Task 11 (useRecording) ← depends on 3, 9, 10
       ↓
Task 12 (Integration test + changeset)
```

Task 2-3, 4-5, 6-7, 8 は並列実行可能。
