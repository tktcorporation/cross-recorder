# Cross Recorder - 実装計画

## Context

クロスプラットフォーム (macOS + Windows) のデスクトップ音声録音アプリを Electrobun フレームワークで構築する。Audacity + OBS の合体版として、マイクとシステム音声を別チャンネルで録音できる「サクッと起動してすぐ録音」アプリを目指す。

## 技術スタック

| 項目 | 選定 | 理由 |
|---|---|---|
| フレームワーク | Electrobun v1.14.x | Bun + CEF、組み込み型安全 RPC |
| UI | React + Tailwind CSS + Vite | Electrobun 公式テンプレートあり |
| 型安全 IPC | Electrobun 組み込み RPC | tRPC/oRPC 不要。スキーマ定義で双方向型安全通信 |
| ドメインロジック | Effect.ts | 型安全エラーハンドリング、サービス合成 |
| 状態管理 | Zustand | 軽量、React との親和性 |
| Lint/Format | OXC lint (type-aware) + OXC format | 高速、TypeScript ネイティブ |
| 音声キャプチャ | Web Audio API (getUserMedia, getDisplayMedia) | CEF 上で動作、クロスプラットフォーム |
| 録音形式 | WAV (非圧縮、録音時) | PCM 直書き、クラッシュ耐性 |
| エクスポート | MP3 (lamejs), AAC (ffmpeg) | R2 フェーズで実装 |
| レンダラー | CEF (Chromium) | `systemAudio: "include"` に必要 |

## アーキテクチャ概要

```
+---------------------------+      型安全 RPC       +---------------------------+
|    Main Process (Bun)     | <------------------> |    Renderer (CEF/React)    |
|                           |                      |                           |
| - FileService (WAV書込)   | saveRecordingChunk() | - getUserMedia (マイク)    |
| - ExportService (MP3/AAC) | finalizeRecording()  | - getDisplayMedia (システム)|
| - Config 永続化           | getAudioDevices()    | - AudioWorklet (PCM取得)   |
| - OS ネイティブ機能       | startRecording() etc | - ChannelMerger (多チャンネル)|
+---------------------------+                      +---------------------------+
```

**録音パイプライン**: マイク/システム音声 → MediaStream → AudioContext → ChannelMergerNode → AudioWorkletNode (PCM取得) → base64エンコード → RPC → Bun → ファイル書込み

## プロジェクト構造

```
cross-recorder/
├── src/
│   ├── bun/                          # Main process
│   │   ├── index.ts                  # エントリポイント、BrowserWindow 作成
│   │   ├── rpc.ts                    # RPC ハンドラ定義
│   │   └── services/
│   │       ├── FileService.ts        # WAV チャンク書込み・最終化
│   │       ├── ExportService.ts      # MP3/AAC 変換 (R2)
│   │       ├── RecordingManager.ts   # 録音ファイル CRUD
│   │       └── ConfigManager.ts      # ユーザー設定永続化
│   │
│   ├── mainview/                     # Renderer (React)
│   │   ├── index.html
│   │   ├── index.css                 # Tailwind エントリ
│   │   ├── main.tsx                  # React エントリ
│   │   ├── App.tsx
│   │   ├── rpc.ts                    # Electroview RPC セットアップ
│   │   ├── components/
│   │   │   ├── SourcePanel.tsx       # マイク選択 + システム音声トグル
│   │   │   ├── RecordPanel.tsx       # 録音/停止ボタン + タイマー
│   │   │   ├── RecordingsList.tsx    # 録音履歴リスト
│   │   │   ├── RecordingItem.tsx     # 録音行アイテム
│   │   │   └── AudioPlayer.tsx       # 再生コントロール
│   │   ├── audio/
│   │   │   ├── AudioCaptureManager.ts    # 録音オーケストレーション
│   │   │   ├── MicrophoneCapture.ts      # getUserMedia ラッパー
│   │   │   ├── SystemAudioCapture.ts     # getDisplayMedia ラッパー
│   │   │   ├── RecordingPipeline.ts      # AudioContext + WorkletNode
│   │   │   ├── WavEncoder.ts             # WAV ヘッダ生成
│   │   │   └── worklets/
│   │   │       └── pcm-recorder.worklet.js  # AudioWorkletProcessor
│   │   ├── hooks/
│   │   │   ├── useRecording.ts
│   │   │   ├── useAudioDevices.ts
│   │   │   └── useRpc.ts
│   │   └── stores/
│   │       └── recordingStore.ts     # Zustand ストア
│   │
│   └── shared/                       # 両プロセス共有
│       ├── rpc-schema.ts             # RPC スキーマ型定義
│       ├── types.ts                  # ドメイン型 (AudioDevice, RecordingMetadata 等)
│       ├── errors.ts                 # Effect.ts TaggedError 定義
│       └── constants.ts              # デフォルト設定値
│
├── electrobun.config.ts              # CEF バンドル有効化
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
├── oxlint.json                       # OXC lint 設定
└── package.json
```

## ユーザーフロー (MVP)

```
1. 起動 → メインウィンドウ表示 (<2秒)
2. 初回のみ: マイク権限リクエスト
3. ソース選択:
   - マイク: ドロップダウンからデバイス選択
   - システム音声: チェックボックスで有効化 → 画面選択ダイアログ
4. 録音開始: 大きな RECORD ボタンをクリック
5. 録音中: タイマー (HH:MM:SS) + ファイルサイズ表示 + 赤い録音インジケーター
6. 録音停止: STOP ボタン → WAV ファイル自動保存
7. 録音後: 録音リストに表示 → 再生 / フォルダを開く
```

## リリーススライス

### R1 (MVP) - 本プランのスコープ
- Electrobun プロジェクトセットアップ (React + Tailwind + Vite + CEF)
- 共有 RPC スキーマ定義
- マイク録音 (getUserMedia → AudioWorklet → PCM → WAV)
- システム音声録音 (getDisplayMedia w/ systemAudio)
- 2チャンネル WAV 出力 (マイク=左, システム=右)
- 基本 UI: ソース選択、録音/停止、タイマー、録音リスト
- 録音ファイルの再生
- クラッシュ耐性 WAV 書込み (定期的ヘッダ更新)

### R2 以降 (将来)
- レベルメーター、一時停止/再開
- MP3/AAC エクスポート
- OBS 風ソース管理
- VST プラグイン対応

## 実装ステップ (R1)

### Step 1: プロジェクト初期化
- `bunx electrobun init` で React + Tailwind + Vite テンプレートから開始
- `effect`, `zustand`, `nanoid` を追加
- OXC lint/format 設定
- TypeScript strict モード設定
- `electrobun.config.ts` に CEF バンドル設定

### Step 2: 共有型定義
- `src/shared/rpc-schema.ts` - RPC スキーマ (Electrobun RPCSchema 形式)
- `src/shared/types.ts` - AudioDevice, RecordingMetadata, RecordingState
- `src/shared/errors.ts` - Effect.ts TaggedError (FileWriteError, PermissionDeniedError 等)
- `src/shared/constants.ts` - デフォルトサンプルレート、バッファサイズ

### Step 3: Main Process (Bun 側)
- `src/bun/index.ts` - BrowserWindow 作成、RPC 接続
- `src/bun/rpc.ts` - BrowserView.defineRPC ハンドラ実装
- `src/bun/services/FileService.ts` - チャンク書込み + WAV 最終化 (Effect.ts)
- `src/bun/services/RecordingManager.ts` - 録音ファイル一覧・削除
- `src/bun/services/ConfigManager.ts` - 設定 JSON 永続化

### Step 4: AudioWorklet + 録音パイプライン
- `src/mainview/audio/worklets/pcm-recorder.worklet.js` - PCM キャプチャ
- `src/mainview/audio/MicrophoneCapture.ts` - getUserMedia ラッパー
- `src/mainview/audio/SystemAudioCapture.ts` - getDisplayMedia ラッパー
- `src/mainview/audio/RecordingPipeline.ts` - AudioContext グラフ構築
- `src/mainview/audio/WavEncoder.ts` - WAV ヘッダ生成
- `src/mainview/audio/AudioCaptureManager.ts` - 全体オーケストレーション

### Step 5: React UI
- `src/mainview/stores/recordingStore.ts` - Zustand ストア
- `src/mainview/hooks/` - useRecording, useAudioDevices, useRpc
- `src/mainview/components/SourcePanel.tsx` - デバイス選択 UI
- `src/mainview/components/RecordPanel.tsx` - 録音コントロール + タイマー
- `src/mainview/components/RecordingsList.tsx` - 録音履歴
- `src/mainview/components/AudioPlayer.tsx` - 再生コントロール
- `src/mainview/App.tsx` - レイアウト統合

### Step 6: 統合テスト + 動作確認
- `bun run dev` で開発サーバー起動
- マイクのみ録音 → WAV 保存 → 再生確認
- マイク + システム音声録音 → 2ch WAV 確認
- 録音リスト表示 + フォルダを開く確認
- `bun run build` でプロダクションビルド確認

## RPC スキーマ (核心部分)

```typescript
type CrossRecorderRPC = {
  bun: RPCSchema<{
    requests: {
      saveRecordingChunk: {
        params: { sessionId: string; chunkIndex: number; pcmData: string };
        response: { success: boolean; bytesWritten: number };
      };
      finalizeRecording: {
        params: { sessionId: string; config: RecordingConfig; totalChunks: number };
        response: RecordingMetadata;
      };
      getRecordings: { params: {}; response: RecordingMetadata[] };
      openFileLocation: { params: { filePath: string }; response: void };
      getPlaybackUrl: { params: { filePath: string }; response: { url: string } };
    };
    messages: {
      logFromRenderer: { level: string; message: string };
    };
  }>;
  webview: RPCSchema<{
    requests: {};
    messages: {
      recordingStatus: { state: RecordingState; elapsed: number; fileSize: number };
      deviceListChanged: { devices: AudioDevice[] };
    };
  }>;
};
```

## 技術リスク + 対策

| リスク | 対策 |
|---|---|
| macOS システム音声が getDisplayMedia で動かない | CEF バンドル必須。ダメなら ScreenCaptureKit を Bun FFI で呼ぶ |
| base64 エンコードの RPC オーバーヘッド (~33%) | 48kHz/16bit/stereo で ~230KB/s、許容範囲。問題なら WebSocket バイナリ転送 |
| AudioWorklet が CEF で動かない | Chrome 66+ の機能、CEF で動くはず。要検証 |
| 長時間録音の大ファイル (1時間 = ~1GB) | チャンク書込み + ストリーミング最終化で対応 |
| Electrobun の成熟度 | v1.14.x で活発開発中。組み込み RPC が大きなメリット |

## 検証方法

1. `bun run dev` でアプリ起動、メインウィンドウが表示されること
2. マイクドロップダウンにシステムのオーディオデバイスが表示されること
3. RECORD → 数秒録音 → STOP で WAV ファイルが保存されること
4. 保存された WAV を外部プレーヤー (VLC 等) で再生し、音声が正しいこと
5. マイク + システム音声を有効にして録音し、左右チャンネルが独立していること
6. 録音リストから再生ボタンでアプリ内再生できること
7. 「フォルダを開く」でファイルマネージャーが開くこと
8. `bun run build` でプロダクションビルドが成功すること
