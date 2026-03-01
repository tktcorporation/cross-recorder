---
"cross-recorder": patch
---

fix: システム音声録音開始直後に停止してしまう問題を修正

getDisplayMedia で取得したビデオトラックを即座に stop() すると、
画面共有セッション全体が終了しオーディオトラックも連鎖的に終了していた。
ビデオトラックは stop() ではなく enabled=false で無効化するように変更。
