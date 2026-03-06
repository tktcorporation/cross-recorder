# Audio Capture Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** macOS ScreenCaptureKit 統合で蓄積した設計上の不整合を解消し、状態管理・型安全性・責務分離を改善する

**Architecture:** SessionState を単一の Source of Truth にし、レガシー RecordingState を廃止。NativeSystemAudioCapture をクラス化してグローバル状態を排除。FileService の write インターフェースを Buffer ベースに統一。AudioCaptureManager の RPC 型を rpc-schema から導出。イベント伝搬を型安全化。

**Tech Stack:** TypeScript, React, Zustand, Effect, Bun, electrobun

---

### Task 1: RecordingState の廃止と SessionState への統一

**Files:**
- Modify: `src/mainview/stores/recordingStore.ts`
- Modify: `src/mainview/hooks/useRecording.ts`
- Modify: `src/mainview/components/SourcePanel.tsx`

**Step 1: recordingStore から recordingState / setRecordingState を削除**

`recordingStore.ts` から以下を削除:
- `RecordingStore` 型の `recordingState: RecordingState` と `setRecordingState`
- `initialState` の `recordingState: "idle" as RecordingState`
- ストア定義の `setRecordingState: (state) => set({ recordingState: state })`
- `RecordingState` の import（`selectRecordingState` の戻り値型として使うなら残す）

`selectRecordingState` 関数はそのまま残す。

**Step 2: useRecording から setRecordingState の使用を削除**

`useRecording.ts` から以下を削除:
- `const setRecordingState = useRecordingStore((s) => s.setRecordingState);`
- `handleStateTransition` 内の `setRecordingState(selectRecordingState(state));`

**Step 3: SourcePanel を sessionState ベースに変更**

```typescript
// Before:
const recordingState = useRecordingStore((s) => s.recordingState);

// After:
import { selectRecordingState } from "../stores/recordingStore.js";
const recordingState = useRecordingStore((s) => selectRecordingState(s.sessionState));
```

**Step 4: ビルド確認**

Run: `pnpm build`

**Step 5: コミット**

```
refactor: remove legacy RecordingState, use SessionState as single source of truth
```

---

### Task 2: NativeSystemAudioCapture のクラス化

**Files:**
- Modify: `src/bun/services/NativeSystemAudioCapture.ts`
- Modify: `src/bun/rpc.ts`

**Step 1: NativeSystemAudioCapture をクラスに変換**

- `findBinaryPath()` → private static メソッド
- `isAvailable()`, `checkPermission()` → public static メソッド
- `activeCapture` → `private capture: ActiveCapture | null` インスタンスプロパティ
- `start()`, `stop()`, `stopIfActive()`, `isActive()` → インスタンスメソッド
- `readStderrLoop`, `readStdoutLoop`, `readNextMessage` → private メソッド
- ループ内の `activeCapture` 参照 → `this.capture` に変更

**Step 2: rpc.ts でインスタンスを使用**

```typescript
// Before:
import * as NativeCapture from "./services/NativeSystemAudioCapture.js";

// After:
import { NativeSystemAudioCapture } from "./services/NativeSystemAudioCapture.js";
const nativeCapture = new NativeSystemAudioCapture();
```

static: `NativeSystemAudioCapture.isAvailable()`, `NativeSystemAudioCapture.checkPermission()`
instance: `nativeCapture.start()`, `nativeCapture.stop()`, `nativeCapture.stopIfActive()`

**Step 3: ビルド確認**

Run: `pnpm build`

**Step 4: コミット**

```
refactor: convert NativeSystemAudioCapture from module globals to class instance
```

---

### Task 3: FileService の write インターフェース統一

**Files:**
- Modify: `src/bun/services/FileService.ts`
- Modify: `src/bun/rpc.ts`

**Step 1: 内部実装を共通化**

FileService に private 関数を抽出:

```typescript
function writeChunkToTrack(sessionId: string, trackKind: TrackKind, buffer: Buffer) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  const track = session.tracks.get(trackKind);
  if (!track) throw new Error(`Track not found: ${trackKind}`);
  fs.writeSync(track.fd, buffer, 0, buffer.length);
  track.bytesWritten += buffer.length;
  return { success: true as const, bytesWritten: track.bytesWritten };
}
```

**Step 2: public API を整理**

- `writeChunk(sessionId, trackKind, buffer: Buffer)` → Effect ラップ版（RPC 用）
- `writeChunkSync(sessionId, trackKind, buffer: Buffer)` → 同期版（NativeCapture 用）
- 旧 `writeChunkBufferSync` を削除
- 旧 `writeChunk` の base64 デコードロジックを削除（rpc.ts 側に移動）

**Step 3: rpc.ts を修正**

`saveRecordingChunk` ハンドラで base64 → Buffer 変換:
```typescript
const buffer = Buffer.from(params.pcmData, "base64");
return Effect.runPromise(FileService.writeChunk(params.sessionId, params.trackKind, buffer));
```

NativeCapture コールバック:
```typescript
(buffer) => FileService.writeChunkSync(params.sessionId, "system", buffer)
```

**Step 4: ビルド確認**

Run: `pnpm build`

**Step 5: コミット**

```
refactor: unify FileService write interface with shared internal implementation
```

---

### Task 4: AudioCaptureManager の RPC 型を rpc-schema から導出

**Files:**
- Modify: `src/mainview/audio/AudioCaptureManager.ts`

**Step 1: ローカル RpcRequest 型を rpc モジュールから導出**

```typescript
// Before: 35行の手動型定義
type RpcRequest = { ... };

// After:
import type { rpc } from "../rpc.js";
type RpcRequest = Pick<
  typeof rpc.request,
  | "checkSystemAudioPermission"
  | "startRecordingSession"
  | "saveRecordingChunk"
  | "finalizeRecording"
  | "cancelRecording"
>;
```

**Step 2: ビルド確認**

Run: `pnpm build`

**Step 3: コミット**

```
refactor: derive AudioCaptureManager RPC type from rpc module
```

---

### Task 5: イベント伝搬の型安全化

**Files:**
- Create: `src/mainview/hooks/useWindowEvent.ts`
- Modify: `src/mainview/hooks/useRecording.ts`

**Step 1: useWindowEvent フックを作成**

```typescript
import { useEffect } from "react";

type WindowEventDetailMap = {
  "recording-status": { state: string; elapsedMs: number; fileSizeBytes: number };
  "native-system-audio-level": { level: number };
  "native-system-audio-error": { reason: string };
  "device-list-changed": { devices: unknown[] };
  "update-status": { status: string; message: string; progress?: number };
};

export function useWindowEvent<K extends keyof WindowEventDetailMap>(
  eventName: K,
  handler: (detail: WindowEventDetailMap[K]) => void,
  deps: React.DependencyList = [],
): void {
  useEffect(() => {
    const listener = (e: Event) => {
      handler((e as CustomEvent).detail as WindowEventDetailMap[K]);
    };
    window.addEventListener(eventName, listener);
    return () => window.removeEventListener(eventName, listener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventName, ...deps]);
}
```

**Step 2: useRecording の addEventListener を置換**

3つの useEffect を useWindowEvent に置き換え:

```typescript
useWindowEvent("recording-status", (detail) => {
  updateStatus(detail.elapsedMs, detail.fileSizeBytes);
}, [updateStatus]);

useWindowEvent("native-system-audio-level", (detail) => {
  setNativeSystemLevel(detail.level);
}, [setNativeSystemLevel]);

useWindowEvent("native-system-audio-error", (detail) => {
  console.warn("Native system audio error:", detail.reason);
  sessionRef.current?.dispatch({ type: "TRACK_LOST", track: "system" });
}, []);
```

**Step 3: ビルド確認**

Run: `pnpm build`

**Step 4: コミット**

```
refactor: add type-safe useWindowEvent hook, replace raw addEventListener
```

---

### Task 6: changeset ファイルの追加

**Files:**
- Create: `.changeset/refactor-audio-capture.md`

**Step 1: changeset 作成**

```markdown
---
"cross-recorder": patch
---

音声キャプチャ周りのリファクタリング: RecordingState 廃止、NativeSystemAudioCapture クラス化、FileService write インターフェース統一、RPC 型導出、イベント伝搬の型安全化
```

**Step 2: コミット**

```
chore: add changeset for audio capture refactor
```

---

## 実行順序

Task 1 → 2 → 3 → 4 → 5 → 6（順序依存あり: Task 1 が先行必須）
