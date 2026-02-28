---
"cross-recorder": patch
---

fix: システム音声キャプチャの権限取得問題とバージョン表示の不一致を修正

- getDisplayMedia を video:true に変更し、プラットフォーム互換性を向上
- オーディオトラックが取得できなかった場合のバリデーションを追加
- 録音開始の部分的失敗時にリソースをクリーンアップするように修正
- electrobun.config.ts のバージョンを package.json と一致させた
