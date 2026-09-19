# プッシュ前のローカルチェック

プッシュの前に、CI で実行されるチェックをローカルで一通り実行して pass を確認すること。
**チェックが fail している状態でプッシュしてはいけない。**

## CI と対応するローカルコマンド

CI ワークフロー (`ci.yml`) の全ステップに対応:

```bash
# 1. lint
pnpm lint

# 1b. src/native/linux/*.sh の ShellCheck
pnpm lint:shell

# 2. 型チェック
pnpm typecheck

# 3. テスト
pnpm test

# 3b. capture-system-audio.sh の bats テスト
pnpm test:bats

# 4. Vite ビルド
pnpm build:vite
```

`pnpm lint:shell` は shellcheck、`pnpm test:bats` は bats-core が必要（未導入なら `apt-get install -y shellcheck bats`。CI（`ci.yml`）も同じコマンドで導入する）。

## Changeset チェック

`changeset-check.yml` に対応。`src/` や `electrobun.config` 配下のコード変更がある場合は、
changeset ファイル (`.changeset/<名前>.md`) が含まれていることを確認する。
詳細は `ci-workflow.md` を参照。

## ルール

- 上記のコマンドは**プッシュ前に必ず全て実行**する
- 既存の（変更と無関係な）エラーは許容するが、自分の変更で新たなエラーを増やしてはいけない
- fail した場合は修正してから再度チェック → パスを確認 → プッシュ
- 環境依存で実行できない場合（依存パッケージ未インストール等）は、その旨をユーザーに報告してから判断を仰ぐ
