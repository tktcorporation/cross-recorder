# Waveform Player Design

## Overview

AudioPlayer を波形表示付きプレイヤーに置き換える。Apple ボイスメモ風のミニマル棒グラフで波形を表示し、波形クリックでシーク、再生済み/未再生を色分けで表現する。複数トラックは上下に並べて表示。あわせてシーク時に再生がキャンセルされるバグを修正する。

## Design Decisions

- **波形スタイル**: ミニマル棒グラフ（中央線から上下対称）
- **マルチトラック**: 上下に並べて表示（DAW 風）、シークは全トラック連動
- **シーク方法**: 波形クリックでシーク（従来のシークバーは廃止）
- **再生位置表示**: 再生済み部分をアクセント色、未再生部分をグレーで色分け
- **描画方式**: Canvas 2D API（パフォーマンス優先）

## Component Architecture

```
WaveformPlayer (AudioPlayer を置き換え)
├─ WaveformTrack × N (トラックごとの波形 Canvas)
│  └─ <canvas> (棒グラフ描画 + クリックシーク)
├─ PlaybackControls (再生/一時停止ボタン + 時間表示)
└─ useWaveformData hook (AudioBuffer → 棒の高さ配列)
```

## Waveform Data Generation

1. `AudioBuffer.getChannelData()` で PCM サンプル (Float32Array) を取得
2. Canvas 幅に応じた本数にダウンサンプリング（例: 幅400px, 棒幅2px+間隔1px → 約133本）
3. 各棒の高さ = セグメント内の RMS 値（0〜1 に正規化）
4. ステレオの場合は L/R チャンネルの平均 RMS を使用

## Canvas Rendering

- 棒は中央線から上下対称に描画
- 再生済み部分: `blue-500` (#3b82f6)
- 未再生部分: `gray-400` (#9ca3af)
- `requestAnimationFrame` で色分け境界を更新
- Retina 対応: `devicePixelRatio` でスケーリング

## Seek via Waveform Click

- `canvas.onClick` で `(clickX / canvasWidth) * duration` → 秒数算出
- 全トラックの再生位置を同期更新

## Seek Bug Fix

現在のバグ: `handleSeek` → `startPlayback(time)` → `stopSources()` の流れで、`onended` コールバックが発火し `isPlaying` が `false` になる。

修正方針:
- `isSeeking` ref フラグを導入
- `stopSources` 前に `isSeeking = true` を設定
- `onended` コールバック内で `isSeeking` が `true` なら状態変更をスキップ
- 新ノード作成・開始後に `isSeeking = false` に戻す

## Layout

```
┌────────────────────────────────────────┐
│  Mic (Mono)                            │
│  ▎▌█▌▎▎▌██▌▎ ▎▌█▌▎▎▌█▌▎▎▌█▌▎        │
│  ████████████ █████████████████        │
│  ▎▌█▌▎▎▌██▌▎ ▎▌█▌▎▎▌█▌▎▎▌█▌▎        │
├────────────────────────────────────────┤
│  System (Stereo)                       │
│  ▎▌██▌▎▎▌█▌▎ ▎▌███▌▎▎▌█▌▎▎▌█▌▎      │
│  ████████████ █████████████████        │
│  ▎▌██▌▎▎▌█▌▎ ▎▌███▌▎▎▌█▌▎▎▌█▌▎      │
├────────────────────────────────────────┤
│  ▶  0:42 / 3:15                       │
└────────────────────────────────────────┘
```

- トラック名ラベルは波形の上に小さく表示
- トラック間に薄い区切り線
- 下部にコンパクトな再生コントロール
