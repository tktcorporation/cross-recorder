# Release ワークフローの堅牢化

## Context
v0.3.0 のリリースが失敗した。原因は2つ:
1. `git log -1 --pretty=%s` がマージコミットの1行目しか返さず `"chore: release"` を検出できなかった
2. `cancel-in-progress: true` により連続 push でリリースビルドがキャンセルされた

コミットメッセージ解析は本質的に脆弱（マージ戦略依存、誤検出リスク）なため、根本的に別のアプローチに切り替える。

## Approach: `changesets/action` の publish モードをフル活用

コミットメッセージに一切依存せず、`changesets/action` の `published` output で判定する。

### 仕組み
- changeset ファイルがある場合 → `changesets/action` がリリース PR を作成
- changeset ファイルがない場合（= リリース PR マージ後）→ `publish` コマンドを実行し `published=true` を出力
- `published == 'true'` のときだけビルド + GitHub Release を実行

### 変更ファイル

#### 1. `.github/workflows/release.yml`
- ワークフローレベルの `concurrency` を削除
- 手動の changeset 有無チェック (`Check for changesets` ステップ) を削除
- コミットメッセージベースの検出 (`Check if this is a version bump commit` ステップ) を削除
- `changesets/action` に `publish: pnpm changeset tag` を追加（npm publish せず git tag のみ作成）
- outputs を `published` / `version` に変更
- `build` ジョブの `if` を `needs.changesets.outputs.published == 'true'` に変更
- `build` / `create-release` ジョブにジョブレベルの `concurrency` を追加（`cancel-in-progress: false`）

#### 2. `.changeset/config.json`
- `"privatePackages": { "version": true, "tag": true }` を追加（private パッケージでもタグ作成を有効化）

### 変更しないもの
- `build` / `create-release` ジョブのビルド・パッケージング・リリースステップは既存のまま
- CI ワークフロー (`ci.yml`) は影響なし

## Verification
1. `.changeset/config.json` の `privatePackages` 設定を確認
2. PR をマージ後、Release ワークフローの Changesets ジョブで `published` output が正しく出力されることをログで確認
3. v0.3.0 リリース再トリガー: マージ後にワークフローを re-run し、タグ作成 → ビルド → GitHub Release が成功することを確認
