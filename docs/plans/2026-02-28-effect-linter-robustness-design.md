# Effect.ts + Linter 堅牢化設計

## 目的

コードベースの堅牢性を向上させる。oxlint ルール拡充 + Effect.ts 向けカスタム lint ルール + Effect.ts カバレッジ拡大の3軸で進める。

## 現状

- **oxlint**: v0.15、5ルールのみ有効（99ルール適用中 / 500+利用可能）
- **TypeScript**: `strict: true` + `noUncheckedIndexedAccess` で型安全性は高い
- **Effect.ts**: v3.12.0、バックエンド3サービスで使用（FileService, RecordingManager, ConfigManager）
- **ギャップ**: UpdateService は素の try/catch、RPC 内のベタ書き関数は Effect 未使用、フロントエンドはエラーを console.error するのみ

## 設計

### Part 1: oxlint ルール強化

既存の oxlint 組み込みルールを拡充する。

#### 追加ルール

```jsonc
{
  // 型安全
  "no-explicit-any": "warn",
  "no-non-null-assertion": "warn",

  // エラーハンドリング
  "no-throw-literal": "error",
  "no-empty-catch": "error",
  "no-unsafe-finally": "error",

  // コード品質
  "no-fallthrough": "error",
  "no-implicit-coercion": "warn",
  "no-return-await": "warn",

  // TypeScript 固有
  "no-unnecessary-type-assertion": "warn",
  "consistent-type-imports": "warn"
}
```

### Part 2: Effect.ts 向けカスタム lint ルール（oxlint JS Plugin）

oxlint の JS Plugin 機構（テクニカルプレビュー）を使い、Effect.ts 固有のアンチパターンを検出するカスタムルールを作成する。

#### ルール一覧

| ルール名 | 検出内容 |
|----------|----------|
| `effect/no-runpromise-without-catch` | `Effect.runPromise()` が try/catch で囲まれていない場合に警告 |
| `effect/no-throw-in-effect` | `Effect.tryPromise` の try 内で `throw` を使う代わりに `Effect.fail()` を推奨 |
| `effect/prefer-effect-over-trycatch` | サービス層で素の try/catch があれば `Effect.tryPromise` を提案 |

#### プラグイン配置

```
src/lint/
  effect-plugin.js       # oxlint JS Plugin エントリポイント
  rules/
    no-runpromise-without-catch.js
    no-throw-in-effect.js
    prefer-effect-over-trycatch.js
```

#### oxlintrc.json 設定

```jsonc
{
  "jsPlugins": ["./src/lint/effect-plugin.js"],
  "rules": {
    "effect/no-runpromise-without-catch": "warn",
    "effect/no-throw-in-effect": "warn",
    "effect/prefer-effect-over-trycatch": "warn"
  }
}
```

### Part 3: Effect.ts ギャップ埋め

#### 3-1: UpdateService の Effect 化

4関数（`checkForUpdate`, `downloadUpdate`, `applyUpdate`, `getAppVersion`）を `Effect.tryPromise` でラップ。
新規エラー型: `UpdateCheckError`, `UpdateDownloadError`, `UpdateApplyError`

#### 3-2: RPC ハンドラ内ベタ書き関数の Effect 化

- `getPlaybackData`: `Effect.tryPromise` + `FileReadError`
- `openFileLocation`: `Effect.tryPromise` + 新規 `ShellCommandError`

#### 3-3: RPC 境界エラー伝搬

`Effect.runPromise` をそのまま呼ぶ代わりに、ヘルパーを作成:

```typescript
async function runEffect<A, E extends { _tag: string }>(
  effect: Effect.Effect<A, E>
): Promise<{ success: true; data: A } | { success: false; error: { _tag: string; message: string } }> {
  return Effect.runPromise(
    effect.pipe(
      Effect.map(data => ({ success: true as const, data })),
      Effect.catchAll(e => Effect.succeed({
        success: false as const,
        error: { _tag: e._tag, message: String(e) }
      }))
    )
  );
}
```

### Part 4: tsgolint（型認識 lint）試験導入

oxlint の型認識 linting（アルファ）を試験的に有効化。typescript-go ベースで TypeScript 型情報を使ったルールを適用する。

まだアルファ段階のため、組み込みの型認識ルールのみ有効化し、カスタム型認識ルールは今後の課題とする。

## 実装順序

1. oxlint ルール拡充 + 既存コードの修正
2. Effect.ts カスタム lint ルール作成
3. UpdateService の Effect 化
4. RPC ベタ書き関数の Effect 化
5. RPC 境界エラー伝搬ヘルパー
6. tsgolint 試験導入
7. フロントエンド側エラーハンドリング改善（次フェーズ）

## スコープ外（次フェーズ）

- Effect.ts の Layer/Service パターン導入
- フロントエンド側の構造化エラーハンドリング（UI通知等）
- AudioWorklet のエラーハンドリング改善
