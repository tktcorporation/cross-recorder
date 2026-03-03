---
"cross-recorder": minor
---

macOS でのシステム音声録音を ScreenCaptureKit ベースのネイティブキャプチャに変更。getDisplayMedia ではキャプチャできなかった macOS のシステム全体の音声を、OS の内部オーディオバスから直接取得できるようになった。
