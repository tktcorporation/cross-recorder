# Effect.ts + Linter 堅牢化 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** oxlint ルール拡充 + Effect.ts カスタム lint ルール + Effect.ts カバレッジ拡大で、コードベースの堅牢性を段階的に向上させる。

**Architecture:** oxlint のビルトインルール拡充でガードレールを敷き、JS Plugin でEffect固有ルールを追加。その上でUpdateService・RPCベタ書き関数をEffect化し、RPC境界のエラー伝搬ヘルパーを導入する。

**Tech Stack:** oxlint v0.15+, Effect.ts v3.12, TypeScript 5.7, vitest 4

---

### Task 1: oxlint ルール拡充

**Files:**
- Modify: `oxlint.json`

**Step 1: ルール拡充**

`oxlint.json` を以下に更新:

```json
{
  "$schema": "https://raw.githubusercontent.com/nicolo-ribaudo/tc39-proposal-json-schema/refs/heads/main/oxlint/schema.json",
  "rules": {
    "no-unused-vars": "warn",
    "no-console": "off",
    "eqeqeq": "error",
    "no-var": "error",
    "prefer-const": "warn",

    "no-explicit-any": "warn",
    "no-non-null-assertion": "warn",

    "no-throw-literal": "error",
    "no-empty-catch": "error",
    "no-unsafe-finally": "error",

    "no-fallthrough": "error",
    "no-implicit-coercion": "warn",
    "no-return-await": "warn"
  },
  "ignorePatterns": ["dist", "node_modules", "*.worklet.js"]
}
```

**Step 2: lint を実行して違反を確認**

Run: `pnpm lint`
Expected: 新ルールによる警告・エラーが報告される可能性あり

**Step 3: 違反箇所を修正**

既存コードの違反があれば修正する。特に:
- `no-explicit-any` — `any` を具体的な型に置換
- `no-non-null-assertion` — `!` を型ガードやオプショナルチェインに置換
- `no-throw-literal` — 文字列 throw を `new Error()` に変更
- `no-empty-catch` — 空 catch に少なくとも `// intentionally empty` コメントまたは処理を追加

**Step 4: lint が通ることを確認**

Run: `pnpm lint`
Expected: 0 errors（warn は許容）

**Step 5: コミット**

```bash
jj commit -m "chore: expand oxlint rules for type safety and error handling"
```

---

### Task 2: 新規エラー型の追加

**Files:**
- Modify: `src/shared/errors.ts`
- Create: `src/shared/errors.test.ts`

**Step 1: テストを書く**

```typescript
import { describe, it, expect } from "vitest";
import {
  UpdateCheckError,
  UpdateDownloadError,
  UpdateApplyError,
  ShellCommandError,
} from "./errors.js";

describe("Error types", () => {
  it("UpdateCheckError has correct tag", () => {
    const err = new UpdateCheckError({ reason: "network" });
    expect(err._tag).toBe("UpdateCheckError");
    expect(err.reason).toBe("network");
  });

  it("UpdateDownloadError has correct tag", () => {
    const err = new UpdateDownloadError({ reason: "disk full" });
    expect(err._tag).toBe("UpdateDownloadError");
    expect(err.reason).toBe("disk full");
  });

  it("UpdateApplyError has correct tag", () => {
    const err = new UpdateApplyError({ reason: "permission" });
    expect(err._tag).toBe("UpdateApplyError");
    expect(err.reason).toBe("permission");
  });

  it("ShellCommandError has correct tag", () => {
    const err = new ShellCommandError({ command: "open", reason: "not found" });
    expect(err._tag).toBe("ShellCommandError");
    expect(err.command).toBe("open");
  });
});
```

**Step 2: テスト失敗を確認**

Run: `pnpm test -- src/shared/errors.test.ts`
Expected: FAIL — 型がまだ存在しない

**Step 3: エラー型を追加**

`src/shared/errors.ts` に以下を追加:

```typescript
export class UpdateCheckError extends Data.TaggedError("UpdateCheckError")<{
  readonly reason: string;
}> {}

export class UpdateDownloadError extends Data.TaggedError("UpdateDownloadError")<{
  readonly reason: string;
}> {}

export class UpdateApplyError extends Data.TaggedError("UpdateApplyError")<{
  readonly reason: string;
}> {}

export class ShellCommandError extends Data.TaggedError("ShellCommandError")<{
  readonly command: string;
  readonly reason: string;
}> {}
```

**Step 4: テスト通過を確認**

Run: `pnpm test -- src/shared/errors.test.ts`
Expected: PASS

**Step 5: コミット**

```bash
jj commit -m "feat: add UpdateCheckError, UpdateDownloadError, UpdateApplyError, ShellCommandError"
```

---

### Task 3: UpdateService の Effect 化

**Files:**
- Modify: `src/bun/services/UpdateService.ts`
- Modify: `src/bun/rpc.ts`

**Step 1: UpdateService を Effect.tryPromise でラップ**

`src/bun/services/UpdateService.ts` の4つの公開関数を Effect 化:

```typescript
import { Effect } from "effect";
import { Updater } from "electrobun/bun";
import type { UpdateStatusEntry } from "electrobun/bun";
import type { UpdateStatus } from "../../shared/types.js";
import {
  UpdateCheckError,
  UpdateDownloadError,
  UpdateApplyError,
} from "../../shared/errors.js";

// ... (型定義・mapStatus・init はそのまま)

export function checkForUpdate() {
  return Effect.tryPromise({
    try: async () => {
      const result = await Updater.checkForUpdate();
      return {
        version: result.version || "",
        updateAvailable: result.updateAvailable || false,
        error: "",
      };
    },
    catch: (error) =>
      new UpdateCheckError({ reason: String(error) }),
  });
}

export function downloadUpdate() {
  return Effect.tryPromise({
    try: async () => {
      await Updater.downloadUpdate();
      const info = Updater.updateInfo();
      if (info?.error) {
        throw new Error(info.error);
      }
      return { success: true as const, error: "" };
    },
    catch: (error) =>
      new UpdateDownloadError({ reason: String(error) }),
  });
}

export function applyUpdate() {
  return Effect.tryPromise({
    try: async () => {
      await Updater.applyUpdate();
      return { success: true as const, error: "" };
    },
    catch: (error) =>
      new UpdateApplyError({ reason: String(error) }),
  });
}

export function getAppVersion() {
  return Effect.tryPromise({
    try: async () => {
      const version = await Updater.localInfo.version();
      const channel = await Updater.localInfo.channel();
      return { version, channel };
    },
    catch: (error) =>
      new UpdateCheckError({ reason: String(error) }),
  });
}
```

**Step 2: rpc.ts の UpdateService 呼び出しを Effect.runPromise に変更**

`src/bun/rpc.ts` の該当箇所を修正:

```typescript
checkForUpdate: async () => {
  return Effect.runPromise(UpdateService.checkForUpdate());
},
downloadUpdate: async () => {
  return Effect.runPromise(UpdateService.downloadUpdate());
},
applyUpdate: async () => {
  return Effect.runPromise(UpdateService.applyUpdate());
},
getAppVersion: async () => {
  return Effect.runPromise(UpdateService.getAppVersion());
},
```

**Step 3: 型チェックを実行**

Run: `pnpm typecheck`
Expected: 0 errors

**Step 4: コミット**

```bash
jj commit -m "refactor: convert UpdateService to Effect.ts"
```

---

### Task 4: RPC ベタ書き関数の Effect 化

**Files:**
- Modify: `src/bun/rpc.ts`
- Modify: `src/bun/services/FileService.ts`（getPlaybackData を移動）

**Step 1: getPlaybackData を FileService に移動して Effect 化**

`src/bun/services/FileService.ts` に追加:

```typescript
export function getPlaybackData(filePath: string) {
  return Effect.tryPromise({
    try: async () => {
      const fileBuffer = fs.readFileSync(filePath);
      const base64 = fileBuffer.toString("base64");
      return { data: base64, mimeType: "audio/wav" };
    },
    catch: (error) =>
      new FileReadError({
        path: filePath,
        reason: String(error),
      }),
  });
}
```

**Step 2: openFileLocation を新規サービス関数として Effect 化**

`src/bun/rpc.ts` 内にヘルパーを作成するか、FileService に追加:

```typescript
import { ShellCommandError } from "../../shared/errors.js";

export function openFileLocation(filePath: string) {
  return Effect.tryPromise({
    try: async () => {
      const platform = process.platform;
      if (platform === "darwin") {
        Bun.spawn(["open", "-R", filePath]);
      } else if (platform === "win32") {
        Bun.spawn(["explorer", "/select,", filePath]);
      } else {
        const dir = filePath.substring(0, filePath.lastIndexOf("/"));
        Bun.spawn(["xdg-open", dir]);
      }
    },
    catch: (error) =>
      new ShellCommandError({
        command: "openFileLocation",
        reason: String(error),
      }),
  });
}
```

**Step 3: rpc.ts を更新**

```typescript
getPlaybackData: async (params: { filePath: string }) => {
  return Effect.runPromise(FileService.getPlaybackData(params.filePath));
},
openFileLocation: async (params: { filePath: string }) => {
  return Effect.runPromise(FileService.openFileLocation(params.filePath));
},
```

`rpc.ts` から `import * as fs from "node:fs"` を削除（もう不要）。

**Step 4: 型チェック実行**

Run: `pnpm typecheck`
Expected: 0 errors

**Step 5: コミット**

```bash
jj commit -m "refactor: move getPlaybackData/openFileLocation to FileService with Effect"
```

---

### Task 5: RPC 境界エラー伝搬ヘルパー

**Files:**
- Create: `src/shared/rpc-result.ts`
- Create: `src/shared/rpc-result.test.ts`
- Modify: `src/bun/rpc.ts`

**Step 1: テストを書く**

```typescript
import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import { Data } from "effect";
import { runRpcEffect } from "./rpc-result.js";

class TestError extends Data.TaggedError("TestError")<{
  readonly reason: string;
}> {}

describe("runRpcEffect", () => {
  it("returns success result on success", async () => {
    const effect = Effect.succeed({ value: 42 });
    const result = await runRpcEffect(effect);
    expect(result).toEqual({ success: true, data: { value: 42 } });
  });

  it("returns error result on failure", async () => {
    const effect = Effect.fail(new TestError({ reason: "boom" }));
    const result = await runRpcEffect(effect);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error._tag).toBe("TestError");
      expect(result.error.message).toContain("boom");
    }
  });
});
```

**Step 2: テスト失敗を確認**

Run: `pnpm test -- src/shared/rpc-result.test.ts`
Expected: FAIL — モジュールが存在しない

**Step 3: rpc-result.ts を実装**

```typescript
import { Effect } from "effect";

export type RpcSuccess<A> = { readonly success: true; readonly data: A };
export type RpcError = {
  readonly success: false;
  readonly error: { readonly _tag: string; readonly message: string };
};
export type RpcResult<A> = RpcSuccess<A> | RpcError;

export function runRpcEffect<A, E extends { _tag: string }>(
  effect: Effect.Effect<A, E>,
): Promise<RpcResult<A>> {
  return Effect.runPromise(
    effect.pipe(
      Effect.map((data): RpcResult<A> => ({ success: true, data })),
      Effect.catchAll((e) =>
        Effect.succeed<RpcResult<A>>({
          success: false,
          error: { _tag: e._tag, message: String(e) },
        }),
      ),
    ),
  );
}
```

**Step 4: テスト通過を確認**

Run: `pnpm test -- src/shared/rpc-result.test.ts`
Expected: PASS

**Step 5: コミット**

```bash
jj commit -m "feat: add runRpcEffect helper for structured RPC error propagation"
```

**Step 6: rpc.ts で runRpcEffect を使用（段階的移行）**

まずは一部のハンドラだけを `runRpcEffect` に置換して動作確認。全ハンドラの一括置換はリスクが大きいので、エラーが意味を持つハンドラ（`deleteRecording`, `startRecordingSession` 等）から始める:

```typescript
import { runRpcEffect } from "../shared/rpc-result.js";

// 例:
deleteRecording: async (params: { recordingId: string }) => {
  return runRpcEffect(
    RecordingManager.deleteRecording(params.recordingId),
  );
},
```

注意: RPC スキーマの response 型を `RpcResult<T>` に合わせる変更が必要になる。この変更はフロントエンド側のハンドリングと同時に行う必要があるため、**この Task では rpc.ts 内に runRpcEffect の import だけ追加し、実際の適用は TODO コメントで残す**。

**Step 7: 型チェック実行**

Run: `pnpm typecheck`
Expected: 0 errors

**Step 8: コミット**

```bash
jj commit -m "chore: prepare rpc.ts for runRpcEffect migration"
```

---

### Task 6: Effect.ts カスタム lint ルール（oxlint JS Plugin）

**Files:**
- Create: `src/lint/effect-plugin.js`
- Create: `src/lint/rules/no-runpromise-without-catch.js`
- Create: `src/lint/rules/no-throw-in-effect.js`
- Create: `src/lint/rules/prefer-effect-over-trycatch.js`
- Modify: `oxlint.json`

**Step 1: ディレクトリ構造を作成**

```bash
mkdir -p src/lint/rules
```

**Step 2: no-runpromise-without-catch ルールを作成**

`src/lint/rules/no-runpromise-without-catch.js`:

```javascript
/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Warn when Effect.runPromise() is used without error handling",
    },
    messages: {
      noRunPromiseWithoutCatch:
        "Effect.runPromise() can throw. Wrap in try/catch, use runPromiseExit, or use runRpcEffect helper.",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        // Match Effect.runPromise(...)
        if (
          node.callee.type === "MemberExpression" &&
          node.callee.object.type === "Identifier" &&
          node.callee.object.name === "Effect" &&
          node.callee.property.type === "Identifier" &&
          node.callee.property.name === "runPromise"
        ) {
          // Check if inside try block or async function with catch
          let parent = node.parent;
          let inTryCatch = false;
          while (parent) {
            if (parent.type === "TryStatement") {
              inTryCatch = true;
              break;
            }
            // If inside an arrow/function that returns (used in RPC handler context), allow
            if (
              parent.type === "ReturnStatement" ||
              parent.type === "ArrowFunctionExpression"
            ) {
              // Check if the function is inside a try
              let funcParent = parent.parent;
              while (funcParent) {
                if (funcParent.type === "TryStatement") {
                  inTryCatch = true;
                  break;
                }
                funcParent = funcParent.parent;
              }
              break;
            }
            parent = parent.parent;
          }
          if (!inTryCatch) {
            context.report({
              node,
              messageId: "noRunPromiseWithoutCatch",
            });
          }
        }
      },
    };
  },
};
```

**Step 3: no-throw-in-effect ルールを作成**

`src/lint/rules/no-throw-in-effect.js`:

```javascript
/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Prefer Effect.fail() over throw inside Effect.tryPromise try blocks",
    },
    messages: {
      noThrowInEffect:
        "Avoid throw inside Effect.tryPromise. Use Effect.fail() for typed errors, or let the catch handler handle it.",
    },
    schema: [],
  },
  create(context) {
    let insideEffectTry = false;

    return {
      CallExpression(node) {
        // Detect Effect.tryPromise({ try: ... })
        if (
          node.callee.type === "MemberExpression" &&
          node.callee.object.type === "Identifier" &&
          node.callee.object.name === "Effect" &&
          node.callee.property.type === "Identifier" &&
          node.callee.property.name === "tryPromise" &&
          node.arguments.length > 0 &&
          node.arguments[0].type === "ObjectExpression"
        ) {
          const tryProp = node.arguments[0].properties.find(
            (p) =>
              p.type === "Property" &&
              p.key.type === "Identifier" &&
              p.key.name === "try",
          );
          if (tryProp && tryProp.value) {
            // Mark that we're inside the try callback
            insideEffectTry = true;
          }
        }
      },
      "CallExpression:exit"(node) {
        if (
          node.callee.type === "MemberExpression" &&
          node.callee.object.type === "Identifier" &&
          node.callee.object.name === "Effect" &&
          node.callee.property.type === "Identifier" &&
          node.callee.property.name === "tryPromise"
        ) {
          insideEffectTry = false;
        }
      },
      ThrowStatement(node) {
        if (insideEffectTry) {
          context.report({
            node,
            messageId: "noThrowInEffect",
          });
        }
      },
    };
  },
};
```

**Step 4: prefer-effect-over-trycatch ルールを作成**

`src/lint/rules/prefer-effect-over-trycatch.js`:

```javascript
/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Suggest using Effect.tryPromise over try/catch in service files",
    },
    messages: {
      preferEffect:
        "Consider using Effect.tryPromise instead of try/catch in service files for consistent error handling.",
    },
    schema: [],
  },
  create(context) {
    const filename = context.getFilename();
    // Only apply to service files
    if (!filename.includes("/services/")) {
      return {};
    }

    return {
      TryStatement(node) {
        // Check if this file already imports Effect
        const sourceCode = context.getSourceCode();
        const hasEffectImport = sourceCode.ast.body.some(
          (stmt) =>
            stmt.type === "ImportDeclaration" &&
            stmt.source.value === "effect",
        );
        if (hasEffectImport) {
          context.report({
            node,
            messageId: "preferEffect",
          });
        }
      },
    };
  },
};
```

**Step 5: プラグインエントリポイントを作成**

`src/lint/effect-plugin.js`:

```javascript
const noRunPromiseWithoutCatch = require("./rules/no-runpromise-without-catch.js");
const noThrowInEffect = require("./rules/no-throw-in-effect.js");
const preferEffectOverTrycatch = require("./rules/prefer-effect-over-trycatch.js");

module.exports = {
  rules: {
    "no-runpromise-without-catch": noRunPromiseWithoutCatch,
    "no-throw-in-effect": noThrowInEffect,
    "prefer-effect-over-trycatch": preferEffectOverTrycatch,
  },
};
```

**Step 6: oxlint.json に jsPlugins を追加**

```json
{
  "jsPlugins": ["./src/lint/effect-plugin.js"],
  "rules": {
    // ... 既存ルール ...
    "effect/no-runpromise-without-catch": "warn",
    "effect/no-throw-in-effect": "warn",
    "effect/prefer-effect-over-trycatch": "warn"
  }
}
```

**Step 7: lint を実行して動作確認**

Run: `pnpm lint`
Expected: カスタムルールの警告が報告される。JS Plugin がテクニカルプレビューのため動作しない可能性もある。その場合はエラー内容を記録し、代替策（スクリプトベースのチェック or ESLint 併用）を検討する。

**Step 8: コミット**

```bash
jj commit -m "feat: add Effect.ts custom lint rules as oxlint JS Plugin"
```

---

### Task 7: 全テスト・lint の最終確認

**Step 1: 全テスト実行**

Run: `pnpm test`
Expected: ALL PASS

**Step 2: lint 実行**

Run: `pnpm lint`
Expected: 0 errors（warn は許容）

**Step 3: 型チェック実行**

Run: `pnpm typecheck`
Expected: 0 errors

**Step 4: コミット（必要なら修正）**

```bash
jj commit -m "chore: fix lint/type violations from robustness improvements"
```

---

## 実装順序まとめ

1. Task 1: oxlint ルール拡充 + 既存違反修正
2. Task 2: 新規エラー型追加（TDD）
3. Task 3: UpdateService Effect 化
4. Task 4: RPC ベタ書き関数の Effect 化
5. Task 5: RPC 境界エラー伝搬ヘルパー（TDD）
6. Task 6: Effect.ts カスタム lint ルール
7. Task 7: 最終確認

## スコープ外（次フェーズ）

- RPC スキーマの response 型を RpcResult<T> に統一
- フロントエンド側の構造化エラーハンドリング
- Layer/Service パターン導入
- tsgolint 型認識 lint 有効化
