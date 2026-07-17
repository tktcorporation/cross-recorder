# cross-recorder

## 0.13.0

### Minor Changes

- [#59](https://github.com/tktcorporation/cross-recorder/pull/59) [`9591d15`](https://github.com/tktcorporation/cross-recorder/commit/9591d15ad25ae5939df60a8486c98de7824cb67d) Thanks [@tktcorporation](https://github.com/tktcorporation)! - UI をスタジオ風のダークテーマに刷新。elevation を持つカラートークン体系、統一されたアイコンセット、録音中にグローする録音ボタン、状態ラベル付きのヒーロータイマー、接地した音声ソースドック、タイトルバーの LIVE インジケータ、ライブラリの空状態を改善した。

### Patch Changes

- [#61](https://github.com/tktcorporation/cross-recorder/pull/61) [`3921dbf`](https://github.com/tktcorporation/cross-recorder/commit/3921dbf871bd3ce560e84c3f370857f727e36856) Thanks [@tktcorporation](https://github.com/tktcorporation)! - 設定パネルの Language 入力欄のスタイルを他の入力欄と統一し、マイクデバイス選択のドロップダウンにテーマに合わせたシェブロンアイコンを追加。未使用の重複コンポーネント（TranscriptionSettings）を削除。

- [#66](https://github.com/tktcorporation/cross-recorder/pull/66) [`4a0caca`](https://github.com/tktcorporation/cross-recorder/commit/4a0cacaecc059e70dfe18bd68ce3b411eabee330) Thanks [@tktcorporation](https://github.com/tktcorporation)! - 録音処理の安定性を改善。

  - WAV ヘッダーを録音中に定期的にチェックポイントし、クラッシュ・強制終了時もそれまでの録音データを保持するようにした
  - 32bit の WAV データサイズ上限（約 6.2 時間/ステレオ、約 12.4 時間/モノラル）に到達しても録音全体が失われず、そのトラックのみ書き込みを打ち切って安全に継続するようにした
  - 録音チャンクの書き込み位置を明示的に指定するよう修正し、ヘッダーが録音データで上書きされないようにした
  - マイクの切断を検知できるようにした（システム音声トラックのみだった TRACK_LOST 検知をマイクにも追加）
  - マイクデバイス一覧の変更時に、選択中のデバイスを不必要に上書きしていた不具合を修正
  - Linux (PipeWire) のシステム音声キャプチャが無音になっていた不具合と、権限チェックが常に失敗していた不具合を修正
  - ネイティブシステム音声キャプチャで発生したエラーが握りつぶされずに通知されるよう修正

## 0.12.0

### Minor Changes

- [#56](https://github.com/tktcorporation/cross-recorder/pull/56) [`17fc813`](https://github.com/tktcorporation/cross-recorder/commit/17fc813ad99ff88fbde0a6df0f9b6c4753aa79d3) Thanks [@tktcorporation](https://github.com/tktcorporation)! - 録音の音声エクスポート機能を追加。複数トラック（mic / system）を 1 本にミックスダウンし、WAV（無圧縮）または MP3（192kbps）で ~/Downloads に書き出せるようにした。

### Patch Changes

- [#55](https://github.com/tktcorporation/cross-recorder/pull/55) [`7c2b3dc`](https://github.com/tktcorporation/cross-recorder/commit/7c2b3dc7434cbf11477fefa0d3468eaba694c98c) Thanks [@tktcorporation](https://github.com/tktcorporation)! - 依存パッケージを更新。マイナー/パッチ更新（electrobun, effect, framer-motion, oxlint, vitest, zustand, radix-ui 等）に加え、concurrently・@vitejs/plugin-react・vite・typescript をメジャー更新。TypeScript 6 / oxlint 1.70 の仕様変更に追従（deprecated な tsconfig `baseUrl` の削除、CSS side-effect import の型宣言追加、廃止された lint ルールの削除・置き換え）。

- [#50](https://github.com/tktcorporation/cross-recorder/pull/50) [`7a26b7c`](https://github.com/tktcorporation/cross-recorder/commit/7a26b7cd215d9b619bdbaad5e0ae5bacf371ddc6) Thanks [@tktcorporation](https://github.com/tktcorporation)! - ネイティブ文字起こしバイナリ未ビルド時に Whisper API へ自動フォールバックするよう修正。サイドバーの横幅崩れを修正。

## 0.11.2

### Patch Changes

- [#48](https://github.com/tktcorporation/cross-recorder/pull/48) [`c2f6a52`](https://github.com/tktcorporation/cross-recorder/commit/c2f6a52a77a6eb517805fa05875a4f918cdd3b8d) Thanks [@tktcorporation](https://github.com/tktcorporation)! - 文字起こしエラー時に具体的な原因が表示されるよう修正。TranscriptionError の reason が FiberFailure でラップされても失われないようにした。

## 0.11.1

### Patch Changes

- [#46](https://github.com/tktcorporation/cross-recorder/pull/46) [`832aace`](https://github.com/tktcorporation/cross-recorder/commit/832aaced0b8779dd97554f18550eae1fcc6c8069) Thanks [@tktcorporation](https://github.com/tktcorporation)! - サイドバーのレイアウト修正、設定画面の追加、macOS ネイティブ文字起こしの API キー不要化

## 0.11.0

### Minor Changes

- [#44](https://github.com/tktcorporation/cross-recorder/pull/44) [`e25b5f5`](https://github.com/tktcorporation/cross-recorder/commit/e25b5f5e57bf7dfaedf22b1edead51346a642488) Thanks [@tktcorporation](https://github.com/tktcorporation)! - 録音の文字起こし機能を追加。OpenAI Whisper API（互換サービス対応）を使用して録音をテキストに変換できる。API 設定画面、文字起こしボタン、結果表示を ExpandedPlayer に統合。

## 0.10.0

### Minor Changes

- [#42](https://github.com/tktcorporation/cross-recorder/pull/42) [`66c08b3`](https://github.com/tktcorporation/cross-recorder/commit/66c08b3d440e49766874934b07028e9f05940bbb) Thanks [@tktcorporation](https://github.com/tktcorporation)! - CEF バンドルを削除しシステム WebView に移行。ダウンロードサイズを ~100MB 削減。

  - 全プラットフォームで bundleCEF: true を削除し、システム WebView を使用
    - macOS: WKWebView (WebKit)
    - Windows: WebView2 (Chromium ベース、OS 管理)
    - Linux: WebKitGTK
  - Linux 用ネイティブシステム音声キャプチャを追加 (PipeWire / PulseAudio)
  - NativeSystemAudioCapture にプラットフォーム定義を導入し、プラットフォーム固有の設定を集約
  - RMS レベル計算を TypeScript 側に統一（全プラットフォーム共通）
  - エラーメッセージのプラットフォーム適合をバックエンドに移動

### Patch Changes

- [#40](https://github.com/tktcorporation/cross-recorder/pull/40) [`640f824`](https://github.com/tktcorporation/cross-recorder/commit/640f824ade530d7f39266445320a6a064c923d23) Thanks [@tktcorporation](https://github.com/tktcorporation)! - Windows で録音中に音声がガビガビになり速度が速くなる問題を修正

  - AudioWorklet が空入力を受け取った際に無音フレームを書き込むように変更。フレームスキップによる WAV ファイルの短縮（＝再生速度の加速）を防止
  - getDisplayMedia の audio constraints に sampleRate / channelCount を明示的に指定し、システムデバイスの native レートとの不一致を防止
  - WAV ヘッダのサンプルレートを AudioContext の実際のレートから取得するように変更（ハードコード 48000 Hz からの脱却）

## 0.9.1

### Patch Changes

- [#39](https://github.com/tktcorporation/cross-recorder/pull/39) [`f2aa3c3`](https://github.com/tktcorporation/cross-recorder/commit/f2aa3c3e9619e93a0fe7fce3d239a0f292352c71) Thanks [@tktcorporation](https://github.com/tktcorporation)! - README をモダンなデザインに刷新し、アプリスクリーンショットを追加

- [#37](https://github.com/tktcorporation/cross-recorder/pull/37) [`e8db399`](https://github.com/tktcorporation/cross-recorder/commit/e8db399a8be0f05554584f992b737756780a06f0) Thanks [@tktcorporation](https://github.com/tktcorporation)! - Windows 向け Electrobun 生成インストーラー(Setup.zip)を GitHub Release に含めるよう修正。

## 0.9.0

### Minor Changes

- [#35](https://github.com/tktcorporation/cross-recorder/pull/35) [`ac792ef`](https://github.com/tktcorporation/cross-recorder/commit/ac792ef636d83e945b8c06d07e01da82aeac3d7d) Thanks [@tktcorporation](https://github.com/tktcorporation)! - UI を大幅改善: シングルビュー切替型レイアウト、shadcn/ui 導入、Framer Motion アニメーション、パルスリング付き録音ボタン、横スクロール波形、カード型ライブラリ、録音後シームレス再生

## 0.8.3

### Patch Changes

- [#33](https://github.com/tktcorporation/cross-recorder/pull/33) [`0a22bda`](https://github.com/tktcorporation/cross-recorder/commit/0a22bda0fd464c7b32d84ef5e208a3fa5cd0ccc5) Thanks [@tktcorporation](https://github.com/tktcorporation)! - native バイナリのビルドを CI の既存 macOS ジョブに統合し、不要な別 workflow・download スクリプトを削除

## 0.8.2

### Patch Changes

- [#31](https://github.com/tktcorporation/cross-recorder/pull/31) [`a417426`](https://github.com/tktcorporation/cross-recorder/commit/a4174260a0700c6bf76d9731056b11c5050aa54b) Thanks [@tktcorporation](https://github.com/tktcorporation)! - 録音・再生の不具合を修正し、設計を改善

  - システムオーディオ録音時のノイキャン問題: getDisplayMedia に audio constraints を直接指定。冗長な applyConstraints を除去
  - ファイルサイズ表示の不正確さ: RPC の `bytesWritten` を `chunkSizeBytes` にリネームして契約を明確化
  - マルチトラック再生失敗 + シーク操作の不具合: PlaybackController を独立モジュールに切り出し、世代管理で onended の誤発火を防止。14 件のユニットテストを追加

## 0.8.1

### Patch Changes

- [#28](https://github.com/tktcorporation/cross-recorder/pull/28) [`679a967`](https://github.com/tktcorporation/cross-recorder/commit/679a967e38f8169e96c3138f1d227145c5ae99eb) Thanks [@tktcorporation](https://github.com/tktcorporation)! - macOS システム音声キャプチャの信頼性改善: ScreenCaptureKit 権限プリフライトチェック追加、ビルドエラーの適切なハンドリング、macOS でネイティブバイナリが見つからない場合の明確なエラーメッセージ表示

- [#28](https://github.com/tktcorporation/cross-recorder/pull/28) [`0c91e66`](https://github.com/tktcorporation/cross-recorder/commit/0c91e66df13a7378480daeaab14fe233f3d8fd51) Thanks [@tktcorporation](https://github.com/tktcorporation)! - 音声キャプチャ周りのリファクタリング: RecordingState 廃止、NativeSystemAudioCapture クラス化、FileService write インターフェース統一、RPC 型導出、イベント伝搬の型安全化

## 0.8.0

### Minor Changes

- [#26](https://github.com/tktcorporation/cross-recorder/pull/26) [`ac7ca57`](https://github.com/tktcorporation/cross-recorder/commit/ac7ca57f999775fc47cb3dd76b83f78cd510f67b) Thanks [@tktcorporation](https://github.com/tktcorporation)! - macOS でのシステム音声録音を ScreenCaptureKit ベースのネイティブキャプチャに変更。getDisplayMedia ではキャプチャできなかった macOS のシステム全体の音声を、OS の内部オーディオバスから直接取得できるようになった。

## 0.7.1

### Patch Changes

- [#23](https://github.com/tktcorporation/cross-recorder/pull/23) [`0e229b4`](https://github.com/tktcorporation/cross-recorder/commit/0e229b48b157d4fe5a13148c1e4b5a23c881f7ef) Thanks [@tktcorporation](https://github.com/tktcorporation)! - 手動アップデートチェック機能の修正: エラーハンドリング改善と CI ワークフローの updater artifacts 生成を堅牢化

- [#25](https://github.com/tktcorporation/cross-recorder/pull/25) [`67e5d9f`](https://github.com/tktcorporation/cross-recorder/commit/67e5d9fe5a53cf339b534f5ab1a3f84041bbbf91) Thanks [@tktcorporation](https://github.com/tktcorporation)! - Fix system audio recording failures and unresponsive recording button.

  - Allow retry from error state in state machine (button no longer freezes after error)
  - Try audio-only getDisplayMedia before falling back to video (avoids NotReadableError)
  - Restore try-catch around applyConstraints for CEF compatibility (regression from b702209)
  - Fix useEffect dependency on handleStateTransition that could cancel active recordings on re-render

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
