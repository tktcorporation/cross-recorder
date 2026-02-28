# cross-recorder

## 0.5.0

### Minor Changes

- [#10](https://github.com/tktcorporation/cross-recorder/pull/10) [`2749db6`](https://github.com/tktcorporation/cross-recorder/commit/2749db6cd29ea49e9a24d4492af10770b253fb4f) Thanks [@tktcorporation](https://github.com/tktcorporation)! - Effect.ts + Linter 堅牢化: oxlint ルール拡充、カスタム lint ルール追加、全バックエンドサービスの Effect.ts 化、RPC エラー伝搬ヘルパー導入

## 0.4.0

### Minor Changes

- [#6](https://github.com/tktcorporation/cross-recorder/pull/6) [`8b02c7d`](https://github.com/tktcorporation/cross-recorder/commit/8b02c7d0627b49afe606616d526d1f43b443e85a) Thanks [@tktcorporation](https://github.com/tktcorporation)! - feat: add auto-updater with Electrobun Updater API

- [#8](https://github.com/tktcorporation/cross-recorder/pull/8) [`a9c23a5`](https://github.com/tktcorporation/cross-recorder/commit/a9c23a5477654e70e0b24b44c3ff48a95a181197) Thanks [@tktcorporation](https://github.com/tktcorporation)! - feat: replace AudioPlayer with waveform-based player, fix seek bug

## 0.3.0

### Minor Changes

- [#4](https://github.com/tktcorporation/cross-recorder/pull/4) [`1835173`](https://github.com/tktcorporation/cross-recorder/commit/183517348ad7466d784ba96080760c18994c23b2) Thanks [@tktcorporation](https://github.com/tktcorporation)! - Add multi-track audio recording with separate WAV files for mic (mono) and system audio (stereo), Web Audio API-based playback with track mixing, and real-time audio level meters

### Patch Changes

- [`2083ff2`](https://github.com/tktcorporation/cross-recorder/commit/2083ff2e54df3cccdceb004d3d0db97fadee8fde) Thanks [@tktcorporation](https://github.com/tktcorporation)! - Fix release workflow to detect version bump commits for private packages

## 0.2.0

### Minor Changes

- [`d395be7`](https://github.com/tktcorporation/cross-recorder/commit/d395be73387a87ded2f668ab370937f97b8b074f) Thanks [@tktcorporation](https://github.com/tktcorporation)! - Initial R1 MVP release - cross-platform audio recorder with Electrobun

  - Microphone recording via getUserMedia + AudioWorklet
  - System audio capture via getDisplayMedia (CEF)
  - 2-channel WAV output (mic=left, system=right)
  - Basic UI: source selection, record/stop, timer, recordings list, playback
  - Crash-resistant WAV writing with periodic header updates
