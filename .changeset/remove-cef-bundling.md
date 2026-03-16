---
"cross-recorder": minor
---

CEF バンドルを削除しシステム WebView に移行。ダウンロードサイズを ~100MB 削減。

- 全プラットフォームで bundleCEF: true を削除し、システム WebView を使用
  - macOS: WKWebView (WebKit)
  - Windows: WebView2 (Chromium ベース、OS 管理)
  - Linux: WebKitGTK
- Linux 用ネイティブシステム音声キャプチャを追加 (PipeWire / PulseAudio)
- NativeSystemAudioCapture にプラットフォーム定義を導入し、プラットフォーム固有の設定を集約
- RMS レベル計算を TypeScript 側に統一（全プラットフォーム共通）
- エラーメッセージのプラットフォーム適合をバックエンドに移動
