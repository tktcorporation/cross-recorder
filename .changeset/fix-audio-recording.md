---
"cross-recorder": patch
---

録音・再生の不具合を修正し、設計を改善

- システムオーディオ録音時のノイキャン問題: getDisplayMedia に audio constraints を直接指定。冗長な applyConstraints を除去
- ファイルサイズ表示の不正確さ: RPC の `bytesWritten` を `chunkSizeBytes` にリネームして契約を明確化
- マルチトラック再生失敗 + シーク操作の不具合: PlaybackController を独立モジュールに切り出し、世代管理で onended の誤発火を防止。14件のユニットテストを追加
