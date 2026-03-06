# Audio Capture Refactor Design

## Background

macOS ScreenCaptureKit 対応（`ac7ca57`）が後付け統合された結果、音声キャプチャ周りに設計上の不整合が蓄積している。本リファクタリングでは、末端パッチではなく上流の設計を整理し、コードベース全体の一貫性を回復する。

## Changes

### 1. 状態管理の統一

`RecordingState`（レガシー: "idle"|"recording"|"stopping"）を廃止し、`SessionState` を単一の Source of Truth にする。

- `recordingStore` から `recordingState` フィールドと `setRecordingState` を削除
- UI が旧 `RecordingState` を必要とする箇所では `selectRecordingState(sessionState)` セレクタを使用
- `useRecording` での二重同期ロジックを除去

### 2. NativeSystemAudioCapture のクラス化

モジュールグローバル `activeCapture` を排除し、クラスベースに変更。

- `NativeSystemAudioCapture` クラスを作成
- `isAvailable()`, `checkPermission()` は static メソッド
- `start()`, `stop()`, `isActive()` はインスタンスメソッド
- `rpc.ts` でインスタンスを生成して使用

### 3. FileService の write インターフェース統一

`writeChunk`（base64）と `writeChunkBufferSync`（Buffer）の二重インターフェースを統一。

- `writeChunkBuffer(sessionId, trackKind, buffer)` に統一（Effect ラップ）
- base64 → Buffer 変換は RPC ハンドラ側で実施
- `writeChunkBufferSync` を削除

### 4. AudioCaptureManager の RPC 型を rpc-schema から導出

`AudioCaptureManager` 内の `RpcRequest` 独自型定義を削除し、`rpc-schema.ts` から導出。

### 5. Native capture イベント伝搬の型安全化

`CustomEvent` + 文字列ベースの `addEventListener` を改善。

- イベント名を定数化
- `useNativeSystemAudioEvents()` フックに購読ロジックを集約
- 型チェック可能なインターフェースを提供

### 6. recordingStore の整理

- `micAnalyser` / `systemAnalyser`（Web Audio API オブジェクト参照）をストアから削除、`useRef` で管理
- `nativeSystemLevel` もストアから外す
- 不要になった setter を削除

## Non-goals

- RecordingSession FSM のロジック変更（現状の設計は良い）
- RecordingPipeline / AudioWorklet の変更
- RPC スキーマ自体の変更
- 新機能の追加
