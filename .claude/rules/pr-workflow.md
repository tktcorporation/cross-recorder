# PR ワークフロールール

## プッシュ前の必須チェック（CRITICAL）

**コードを push する前に、以下を必ず順番に実行すること。1つでも漏れたら push 禁止。**

1. `pnpm --filter ziku run check` で CI 相当の全チェックを通す（format, lint, typecheck, build, test, docs）
2. changeset ファイルが必要か確認する（機能追加・バグ修正なら必須）
   - `ls .changeset/*.md` で README.md 以外のファイルがあるか確認
   - なければ `.changeset/<名前>.md` を作成
3. 全部通ったことを確認してから `git push`

```bash
# チェックリスト（コピペ用）
pnpm --filter ziku run check         # 全チェック一括
ls .changeset/*.md                    # changeset 確認
# ↑ 両方 OK なら push
```

## PR 作成後の CI ウォッチ

PR を作成した後は、必ず CI が完了するまでウォッチする。

```bash
gh pr checks <PR番号> --watch
```

- CI が全て pass したらユーザーに報告する
- fail したチェックがあれば、ログを確認して修正を試みる
  ```bash
  gh run view <run-id> --log-failed
  ```
- 修正後は再度 push して CI を再ウォッチする

## Changeset

機能追加・バグ修正の PR には必ず changeset ファイルを含める。
コミット・プッシュ前に changeset ファイルが存在するか確認し、なければ作成すること。

```bash
# .changeset/<変更を端的に表す名前>.md を作成
# minor: 機能追加、patch: バグ修正
```

形式:

```markdown
---
"cross-recorder": minor
---

変更の説明
```

- CI に `Changeset Check` ジョブがあり、changeset がないと fail する
- 1 PR に 1 changeset ファイルで十分（複数変更がある場合はまとめてよい）
- ドキュメントのみの変更やリファクタなど、バージョンに影響しない変更は不要
# PR ワークフロールール

## PR 作成後の CI ウォッチ

PR を作成した後は、必ず CI が完了するまでウォッチする。

```bash
gh pr checks <PR番号> --watch
```

- CI が全て pass したらユーザーに報告する
- fail したチェックがあれば、ログを確認して修正を試みる
  ```bash
  gh run view <run-id> --log-failed
  ```
- 修正後は再度 push して CI を再ウォッチする

## Changeset

機能追加・バグ修正の PR には必ず changeset ファイルを含める。
コミット・プッシュ前に changeset ファイルが存在するか確認し、なければ作成すること。

```bash
# .changeset/<変更を端的に表す名前>.md を作成
# minor: 機能追加、patch: バグ修正
```

形式:
```markdown
---
"cross-recorder": minor
---

変更の説明
```

- CI に `Changeset Check` ジョブがあり、changeset がないと fail する
- 1 PR に 1 changeset ファイルで十分（複数変更がある場合はまとめてよい）
- ドキュメントのみの変更やリファクタなど、バージョンに影響しない変更は不要
