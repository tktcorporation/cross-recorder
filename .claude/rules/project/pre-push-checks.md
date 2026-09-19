# プッシュ前のローカルチェック（cross-recorder 固有）

`.claude/rules/pre-push-checks.md` の CI 対応コマンド一覧に加えて、このリポジトリでは次の 2 つも push 前に実行する。

```bash
# src/native/linux/*.sh の ShellCheck
pnpm lint:shell

# capture-system-audio.sh の bats テスト
pnpm test:bats
```

`pnpm lint:shell` は shellcheck、`pnpm test:bats` は bats-core が必要（未導入なら `apt-get install -y shellcheck bats`。`.github/workflows/ci.yml` も同じコマンドで導入する）。
