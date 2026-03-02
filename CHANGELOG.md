# cross-recorder

## 0.7.0

### Minor Changes

- [#21](https://github.com/tktcorporation/cross-recorder/pull/21) [`c49167d`](https://github.com/tktcorporation/cross-recorder/commit/c49167d35c3e7c8bf07ddedbc3876d7c69ebf1f9) Thanks [@tktcorporation](https://github.com/tktcorporation)! - 録音システムのステートマシン再設計: 状態管理をステートマシンで再構築し、エラー伝播とリソースクリーンアップを統一

### Patch Changes

- [#21](https://github.com/tktcorporation/cross-recorder/pull/21) [`09495b4`](https://github.com/tktcorporation/cross-recorder/commit/09495b4e512705f17f135aa1baed992734f9ae03) Thanks [@tktcorporation](https://github.com/tktcorporation)! - Fix system audio recording stopping immediately and Command+Q not working

  - Simplify getDisplayMedia audio constraints to avoid OverconstrainedError in CEF
  - Add track ended event listeners to detect when display media session terminates
  - Add error display in RecordPanel so users can see why recording failed
  - Add explicit accelerator keys for Quit and Edit menu items

## 0.6.0

### Minor Changes

- [#19](https://github.com/tktcorporation/cross-recorder/pull/19) [`0d158de`](https://github.com/tktcorporation/cross-recorder/commit/0d158def18808feec4524776160c5caccd5e7a47) Thanks [@tktcorporation](https://github.com/tktcorporation)! - 手動アップデートチェック機能を追加。ヘッダーのバージョン表示をクリックすると最新バージョンの有無を確認でき、更新があればそのままアップデートできるようになった。

## 0.5.3

### Patch Changes

- [#18](https://github.com/tktcorporation/cross-recorder/pull/18) [`f60d294`](https://github.com/tktcorporation/cross-recorder/commit/f60d2947c7808797c123a55aefc3ea93c5c65198) Thanks [@tktcorporation](https://github.com/tktcorporation)! - fix: ApplicationMenu を追加して Cmd+Q でアプリが終了するように修正

  - Electrobun の ApplicationMenu.setApplicationMenu() を設定し、Cmd+Q (Quit) および Edit 系ショートカット (Cmd+C/V/X/Z/A) を有効化

- [#16](https://github.com/tktcorporation/cross-recorder/pull/16) [`fb5867e`](https://github.com/tktcorporation/cross-recorder/commit/fb5867e317d16a91719f5f2fa15d412b90d8bcd3) Thanks [@tktcorporation](https://github.com/tktcorporation)! - fix: 録音開始直後に停止してしまう問題を修正

  - AudioContext が suspended 状態で作成された場合に明示的に resume する
  - useRpc が毎レンダリング新しい request オブジェクトを返していた問題を useMemo で修正
  - startRecording の二重実行を ref ベースのガードで防止
  - getDisplayMedia のビデオトラックを stop() ではなく enabled=false で無効化し、画面共有セッションの連鎖終了を防止

## 0.5.2

### Patch Changes

- [#14](https://github.com/tktcorporation/cross-recorder/pull/14) [`6719881`](https://github.com/tktcorporation/cross-recorder/commit/6719881ae40a8e4de10b1808d0e2ee1b752f8096) Thanks [@tktcorporation](https://github.com/tktcorporation)! - fix: electrobun.config.ts のバージョンを package.json から自動取得するように変更し、changeset による bump 時のバージョン不一致を防止。エラー型のテストカバレッジも拡充。

## 0.5.1

### Patch Changes

- [#12](https://github.com/tktcorporation/cross-recorder/pull/12) [`9dcc3bf`](https://github.com/tktcorporation/cross-recorder/commit/9dcc3bf0ef15664b86f9082d5af2b4510dda080c) Thanks [@tktcorporation](https://github.com/tktcorporation)! - fix: システム音声キャプチャの権限取得問題とバージョン表示の不一致を修正

  - getDisplayMedia を video:true に変更し、プラットフォーム互換性を向上
  - オーディオトラックが取得できなかった場合のバリデーションを追加
  - 録音開始の部分的失敗時にリソースをクリーンアップするように修正
  - electrobun.config.ts のバージョンを package.json と一致させた

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
