---
"cross-recorder": minor
---

CEF バンドルを削除しシステム WebView に移行。ダウンロードサイズを ~100MB 削減。

- 全プラットフォームで bundleCEF: true を削除し、システム WebView を使用
  - macOS: WKWebView (WebKit)
  - Windows: WebView2 (Chromium ベース、OS 管理)
  - Linux: WebKitGTK
- Linux 用ネイティブシステム音声キャプチャを追加 (PipeWire / PulseAudio)
- macOS は既存の ScreenCaptureKit、Windows は WebView2 の getDisplayMedia で対応
