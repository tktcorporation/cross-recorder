# cross-recorder

## 0.2.0

### Minor Changes

- [`d395be7`](https://github.com/tktcorporation/cross-recorder/commit/d395be73387a87ded2f668ab370937f97b8b074f) Thanks [@tktcorporation](https://github.com/tktcorporation)! - Initial R1 MVP release - cross-platform audio recorder with Electrobun

  - Microphone recording via getUserMedia + AudioWorklet
  - System audio capture via getDisplayMedia (CEF)
  - 2-channel WAV output (mic=left, system=right)
  - Basic UI: source selection, record/stop, timer, recordings list, playback
  - Crash-resistant WAV writing with periodic header updates
