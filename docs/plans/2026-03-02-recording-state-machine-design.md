# 録音システム ステートマシン再設計

**日付**: 2026-03-02
**ステータス**: 承認済み

## 背景

録音システムで頻発する不具合の根本原因は、状態管理の不備にある。

- `useRecording` が状態管理・デバイス制御・RPC 呼び出し・タイマー管理を全て担当
- `recordingState` が "idle" | "recording" | "stopping" の3状態しかなく、`startingRef` / `stoppingRef` で不正遷移をガード
- RPC `saveRecordingChunk` が fire-and-forget（await なし）でサイレントデータロス
- `stop()` と `cancel()` で異なるクリーンアップパスが存在
- Worklet → Pipeline → Manager → Hook の各境界でエラーが飲み込まれる

## 設計方針

- **ステートマシン + イベントバス** アプローチ
- RPC 経路（Base64 PCM over Electrobun RPC）は維持
- トラック喪失時はグレースフルデグラデーション（生きているトラックで録音継続）

## 状態定義

```
idle → acquiring → recording → stopping → idle
                     │   ↑         │
                     │   └ degraded │
                     │              │
                     └──→ error ←───┘
                            │
                            └──→ idle (dismiss)
```

| 状態 | 意味 | 含まれるデータ |
|------|------|----------------|
| `idle` | 待機中 | なし |
| `acquiring` | デバイス取得中 | requestedTracks |
| `recording` | 正常録音中 | sessionId, activeTracks, startTime |
| `degraded` | 一部トラック喪失だが録音継続中 | sessionId, activeTracks, lostTracks |
| `stopping` | 停止処理中（finalize RPC待ち） | sessionId |
| `error` | エラー発生 | message, lastSessionId? |

## 遷移ルール

| From | Event | To | 副作用 |
|------|-------|----|--------|
| idle | START | acquiring | デバイスアクセス開始 |
| acquiring | ACQUIRED | recording | RPC startSession, パイプライン起動 |
| acquiring | ERROR | error | リソースクリーンアップ |
| recording | TRACK_LOST | degraded | 死んだトラック切り離し、UI 警告 |
| recording | STOP | stopping | パイプライン停止、RPC finalize |
| recording | ERROR | stopping | 緊急停止→保存試行 |
| degraded | STOP | stopping | 同上 |
| degraded | ALL_TRACKS_LOST | stopping | 全トラック死亡→自動停止 |
| stopping | FINALIZED | idle | セッション完了 |
| stopping | ERROR | error | finalize失敗 |
| error | DISMISS | idle | エラー表示クリア |

## コンポーネント構成

```
┌────────────────────────────────────────────────────┐
│  UI Layer                                          │
│  useRecording (React hook)                         │
│  - Zustand store と RecordingSession の橋渡しのみ   │
│  - dispatch(event) を呼ぶだけ                       │
└────────────┬───────────────────────────────────────┘
             │ dispatch / subscribe
┌────────────▼───────────────────────────────────────┐
│  RecordingSession (ステートマシン本体)               │
│  - 状態遷移ロジック                                 │
│  - 各状態に応じたリソース管理の指示                   │
│  - EventEmitter でリスナーに通知                     │
│  - React 非依存 (テスト容易)                        │
└────┬───────────┬───────────────────────────────────┘
     │           │
┌────▼──┐  ┌────▼──────────────────────────────────┐
│Capture│  │ RecordingPipeline (既存を改善)          │
│Manager│  │ - AudioContext/Worklet のライフサイクル  │
│(既存) │  │ - PCM データのコールバック通知            │
└───────┘  └────┬──────────────────────────────────┘
                │ onChunk callback
┌───────────────▼──────────────────────────────────┐
│  ChunkWriter (新規)                               │
│  - RPC saveRecordingChunk を await で呼ぶ          │
│  - 書き込み失敗をステートマシンに ERROR で通知      │
│  - バックプレッシャー管理                          │
└──────────────────────────────────────────────────┘
```

### 各コンポーネントの責務

**RecordingSession** (新規 — 核心)
- ステートマシンの `dispatch(event)` メソッド
- 現在の state に応じて副作用（デバイス取得、パイプライン起動、RPC finalize）を実行
- EventEmitter で `stateChange`, `error`, `trackDegraded` を通知
- React に依存しない純粋な TypeScript クラス → 単体テスト可能

**useRecording** (既存を簡素化)
- RecordingSession のインスタンスを保持
- `stateChange` イベントを listen して Zustand ストアに反映
- startingRef, stoppingRef は不要になる

**ChunkWriter** (新規)
- RecordingPipeline の `onChunk` から呼ばれる
- `await rpc.saveRecordingChunk(...)` で書き込み完了を待つ
- 失敗時に RecordingSession へ `ERROR` イベントを dispatch
- 書き込みキューで順序保証

**SystemAudioCapture / MicrophoneCapture** (既存を微修正)
- onTrackEnded コールバックを start() の前に登録
- エラーを throw で伝播（silent catch を除去）

**RecordingPipeline** (既存を改善)
- AudioContext.resume() のエラーハンドリング追加
- Worklet エラーリスナー追加

## エラー伝播

全てのエラーは RecordingSession の `dispatch()` に集約される。

| エラー種別 | 発生源 | 対応 |
|-----------|--------|------|
| デバイス取得失敗 | getUserMedia / getDisplayMedia | acquiring → error |
| トラック喪失 | MediaStreamTrack ended | recording → degraded |
| 全トラック喪失 | 最後のトラック ended | degraded → stopping |
| チャンク書き込み失敗 | RPC saveRecordingChunk | recording → stopping |
| Finalize 失敗 | RPC finalizeRecording | stopping → error（リトライ可能） |
| AudioContext 異常 | suspended / closed | recording → stopping |

## リソースクリーンアップ

3つのクリーンアップ経路を1つに統一:

```typescript
private async cleanup(shouldFinalize: boolean): Promise<void> {
  // 1. パイプラインを停止（worklet → AudioContext）
  // 2. キャプチャを解放（MediaStream トラック停止）
  // 3. shouldFinalize なら RPC finalize、そうでなければ RPC cancel
  // 4. タイマーをクリア
  // 5. 状態を idle へ遷移
}
```

- ユーザー停止 → `cleanup(true)`
- エラー停止 → `cleanup(true)` (可能な限りデータ保存)
- アンマウント → `cleanup(false)`

Finalize 失敗時は `error` 状態に `lastSessionId` を保持し、リトライ可能にする。

## 型定義

```typescript
type TrackKind = "mic" | "system";

type SessionState =
  | { type: "idle" }
  | { type: "acquiring"; requestedTracks: TrackKind[] }
  | { type: "recording"; sessionId: string; activeTracks: TrackKind[]; startTime: number }
  | { type: "degraded"; sessionId: string; activeTracks: TrackKind[]; lostTracks: TrackKind[] }
  | { type: "stopping"; sessionId: string }
  | { type: "error"; message: string; lastSessionId?: string };

type SessionEvent =
  | { type: "START"; requestedTracks: TrackKind[] }
  | { type: "ACQUIRED"; sessionId: string; tracks: TrackKind[] }
  | { type: "TRACK_LOST"; track: TrackKind }
  | { type: "ALL_TRACKS_LOST" }
  | { type: "STOP" }
  | { type: "FINALIZED" }
  | { type: "ERROR"; reason: string }
  | { type: "DISMISS" };
```

## ファイル構成

### 新規作成

| ファイル | 内容 |
|---------|------|
| `src/mainview/audio/RecordingSession.ts` | ステートマシン本体 |
| `src/mainview/audio/ChunkWriter.ts` | RPC 書き込みキュー |
| `src/mainview/audio/types.ts` | 状態・イベントの型定義 |

### 変更

| ファイル | 変更内容 |
|---------|---------|
| `src/mainview/hooks/useRecording.ts` | 大幅簡素化。RecordingSession の生成＋subscribe＋dispatch のみに |
| `src/mainview/audio/AudioCaptureManager.ts` | チャンク送信を ChunkWriter に移譲。onTrackEnded 登録タイミング修正 |
| `src/mainview/audio/SystemAudioCapture.ts` | エラーの silent catch → throw に変更 |
| `src/mainview/audio/MicrophoneCapture.ts` | 同上 |
| `src/mainview/audio/RecordingPipeline.ts` | AudioContext エラーハンドリング・Worklet エラーリスナー追加 |
| `src/mainview/stores/recordingStore.ts` | 状態を SessionState 型に合わせて拡張 |

### 削除対象

- `useRecording.ts` 内の `startingRef`, `stoppingRef`
- `AudioCaptureManager` 内の `chunkIndex` 手動管理
