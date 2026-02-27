---
"cross-recorder": minor
---

Initial R1 MVP release - cross-platform audio recorder with Electrobun

- Microphone recording via getUserMedia + AudioWorklet
- System audio capture via getDisplayMedia (CEF)
- 2-channel WAV output (mic=left, system=right)
- Basic UI: source selection, record/stop, timer, recordings list, playback
- Crash-resistant WAV writing with periodic header updates
