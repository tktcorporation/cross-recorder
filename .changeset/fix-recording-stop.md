---
"cross-recorder": patch
---

fix: 録音開始直後に停止してしまう問題を修正

- AudioContext が suspended 状態で作成された場合に明示的に resume する
- useRpc が毎レンダリング新しい request オブジェクトを返していた問題を useMemo で修正
- startRecording の二重実行を ref ベースのガードで防止
- getDisplayMedia のビデオトラックを stop() ではなく enabled=false で無効化し、画面共有セッションの連鎖終了を防止
