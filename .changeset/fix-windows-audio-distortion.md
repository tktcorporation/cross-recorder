---
"cross-recorder": patch
---

Windows で録音中に音声がガビガビになり速度が速くなる問題を修正

- AudioWorklet が空入力を受け取った際に無音フレームを書き込むように変更。フレームスキップによる WAV ファイルの短縮（＝再生速度の加速）を防止
- getDisplayMedia の audio constraints に sampleRate / channelCount を明示的に指定し、システムデバイスの native レートとの不一致を防止
- WAV ヘッダのサンプルレートを AudioContext の実際のレートから取得するように変更（ハードコード 48000 Hz からの脱却）
