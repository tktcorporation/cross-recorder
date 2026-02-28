# 音声録音アーキテクチャ改善計画

## Context

現在の録音パイプラインは ChannelMerger でマイク(左) とシステムオーディオ(右) を1つのステレオWAVに合成している。これにより:
- マイク音声が左スピーカーのみ、システムオーディオが右スピーカーのみに入る
- システムオーディオが強制モノラル化 (`channelCount: 1`)
- 再生時に `file://` URL が CEF webview で動作しない
- 音声レベルの可視化がない

**目標**: マイク(モノラル)とシステムオーディオ(ステレオ)を別々のWAVファイルとして録音し、再生時にWeb Audio APIでミックスして自然に聴こえるようにする。リアルタイム音声レベルメーターを追加する。

## 変更ファイル一覧

### Shared層
1. `src/shared/types.ts` - TrackKind, TrackInfo型追加、RecordingMetadata拡張
2. `src/shared/rpc-schema.ts` - RPC署名更新 (tracks対応、getPlaybackUrl → getPlaybackData)

### Audio Pipeline (renderer)
3. `src/mainview/audio/worklets/pcm-recorder.worklet.js` - channelCount可変対応
4. `src/mainview/audio/SystemAudioCapture.ts` - ステレオ(2ch)に変更
5. `src/mainview/audio/RecordingPipeline.ts` - デュアルパイプライン化 + AnalyserNode追加
6. `src/mainview/audio/AudioCaptureManager.ts` - トラック別チャンク送信

### Backend (Bun)
7. `src/bun/services/FileService.ts` - マルチトラックセッション管理
8. `src/bun/rpc.ts` - RPCハンドラ更新
9. `src/bun/services/RecordingManager.ts` - マルチファイル削除対応

### UI
10. `src/mainview/stores/recordingStore.ts` - AnalyserNode state追加
11. `src/mainview/hooks/useRecording.ts` - AnalyserNode保存
12. `src/mainview/components/AudioPlayer.tsx` - Web Audio APIミキシング再生
13. `src/mainview/components/SourcePanel.tsx` - レベルメーター + Mono/Stereoバッジ
14. `src/mainview/components/LevelMeter.tsx` - 新規: レベルメーターコンポーネント
15. `src/mainview/hooks/useAudioLevel.ts` - 新規: AnalyserNodeからレベル取得フック
16. `src/mainview/components/RecordingItem.tsx` - トラック情報表示

---

## Step 1: 型・スキーマ更新

### `src/shared/types.ts`
```typescript
// 追加
export type TrackKind = "mic" | "system";

export type TrackInfo = {
  trackKind: TrackKind;
  fileName: string;
  filePath: string;
  channels: number;
  fileSizeBytes: number;
};

// RecordingMetadata に tracks フィールド追加
export type RecordingMetadata = {
  id: string;
  fileName: string;
  filePath: string;       // 旧録音との後方互換のため維持（ディレクトリパス）
  tracks: TrackInfo[];    // 新規
  createdAt: string;
  durationMs: number;
  fileSizeBytes: number;
  config: RecordingConfig;
};
```

### `src/shared/rpc-schema.ts`
- `startRecordingSession`: params に `tracks: Array<{trackKind: TrackKind; channels: number}>` 追加
- `saveRecordingChunk`: params に `trackKind: TrackKind` 追加
- `finalizeRecording`: `totalChunks` を `Record<TrackKind, number>` に変更
- `getPlaybackUrl` → `getPlaybackData` に変更: `response: { data: string; mimeType: string }`

## Step 2: AudioWorklet チャンネル数可変化

### `src/mainview/audio/worklets/pcm-recorder.worklet.js`
- `processorOptions.channelCount` を受け取り、1ch or 2ch に対応
- バッファ配列を channelCount 分だけ作成
- flush() で channelCount に応じたインターリーブ出力

## Step 3: システムオーディオをステレオ化

### `src/mainview/audio/SystemAudioCapture.ts`
- `channelCount: 1` → `channelCount: 2` に変更

## Step 4: デュアルパイプライン化

### `src/mainview/audio/RecordingPipeline.ts`
完全書き換え:
- 共通 AudioContext を1つ管理
- `addTrack(trackKind, stream, channels, onPcmData)` メソッドで各ソースに独立した AudioWorkletNode + AnalyserNode を作成
- 各トラック: `source → analyser → worklet → silentGain(0) → destination`
  - silentGain(0) で destination に接続し audio graph をアクティブに保つ（worklet の process() が呼ばれる条件）
- `getAnalyserForTrack(trackKind)` で AnalyserNode を公開

### `src/mainview/audio/AudioCaptureManager.ts`
- `chunkIndex` を `Record<TrackKind, number>` に変更
- `addTrack()` で mic と system それぞれに `onPcmData` コールバック設定
- 各コールバックから `saveRecordingChunk` に `trackKind` を付与して送信
- `getMicAnalyser()` / `getSystemAnalyser()` を公開

## Step 5: バックエンド マルチトラック対応

### `src/bun/services/FileService.ts`
- `SessionState` を `Map<TrackKind, { fd, filePath, bytesWritten, channels }>` に変更
- `startSession()`: セッションIDのサブディレクトリを作成し、トラックごとに WAV ファイルを開く
- `writeChunk()`: `trackKind` 引数追加、対応トラックのファイルに書き込み
- `finalizeRecording()`: 各トラックの WAV ヘッダ書き換え、ディレクトリをタイムスタンプにリネーム、`TrackInfo[]` を含む metadata を返す

### `src/bun/rpc.ts`
- `startRecordingSession`: `tracks` パラメータを `FileService.startSession` に渡す
- `saveRecordingChunk`: `trackKind` を `FileService.writeChunk` に渡す
- `finalizeRecording`: `totalChunks` を Record 型で渡す
- `getPlaybackUrl` → `getPlaybackData`: ファイルを読んで base64 で返す

### `src/bun/services/RecordingManager.ts`
- `deleteRecording()`: `tracks` 配列の各ファイルを削除 + ディレクトリ削除
- 旧録音（tracks なし）との後方互換処理

## Step 6: 再生修正 (Web Audio APIミキシング)

### `src/mainview/components/AudioPlayer.tsx`
完全書き換え:
- `<audio>` 要素 + `file://` URL → Web Audio API (`AudioContext` + `AudioBufferSourceNode`) に変更
- 各トラックの WAV データを `getPlaybackData` RPC で取得 → base64デコード → `decodeAudioData()`
- 全トラックの `AudioBufferSourceNode` を同時に `destination` に接続して再生
  - モノラルマイクは Web Audio API が自動的に両スピーカーにアップミックス
  - ステレオシステムオーディオはそのまま両スピーカーで再生
- シーク: ソースノード再作成 + offset指定で再生
- 一時停止: `audioContext.suspend()` / `resume()`

## Step 7: リアルタイム音声レベルメーター

### 新規: `src/mainview/components/LevelMeter.tsx`
- 水平バー: レベルに応じて幅が変化
- 色: 緑(< 0.6) → 黄(< 0.85) → 赤

### 新規: `src/mainview/hooks/useAudioLevel.ts`
- `AnalyserNode` から `getByteTimeDomainData()` で RMS レベル計算
- `requestAnimationFrame` でリアルタイム更新

### `src/mainview/stores/recordingStore.ts`
- `micAnalyser: AnalyserNode | null`, `systemAnalyser: AnalyserNode | null` 追加

### `src/mainview/hooks/useRecording.ts`
- `manager.start()` 後に `store.setMicAnalyser()` / `store.setSystemAnalyser()` 呼び出し

### `src/mainview/components/SourcePanel.tsx`
- 各ソースの下に `LevelMeter` コンポーネント配置
- "Mono" / "Stereo" バッジ追加

### `src/mainview/components/RecordingItem.tsx`
- トラック情報（Mic/System、チャンネル数）を表示

---

## 実装順序

チームエージェントで並列化:

**Agent A (Backend)**: Step 1 → Step 5
**Agent B (Audio Pipeline)**: Step 1完了後 → Step 2 → Step 3 → Step 4
**Agent C (UI)**: Step 5, Step 4完了後 → Step 6 → Step 7

依存関係:
- Step 2, 3 は独立して着手可能
- Step 4 は Step 1, 2, 3 に依存
- Step 5 は Step 1 に依存
- Step 6 は Step 4, 5 に依存
- Step 7 は Step 4 に依存

## 検証方法

1. ビルド: `pnpm build` が型エラーなく成功すること
2. 旧録音の後方互換: `tracks` フィールドがない録音でも再生・削除が動作すること
3. 機能テスト（実機）:
   - マイクのみ → モノラル WAV が1つ作成される
   - システムオーディオのみ → ステレオ WAV が1つ作成される
   - 両方有効 → 2つの WAV ファイルが作成される
   - 再生 → 両方のトラックが自然にミックスされて聴こえる
   - レベルメーターが録音中にリアルタイム表示される
