/**
 * ESLint flat config — カスタム Effect ルール専用。
 *
 * 背景: oxlint はカスタム JS プラグインをサポートしないため、
 * Effect 関連のプロジェクト固有ルールのみ ESLint で実行する。
 * 汎用的な lint ルール（no-var, eqeqeq 等）は oxlint が担当する。
 */
import tseslint from "typescript-eslint";
import effectPlugin from "./src/lint/effect-plugin.mjs";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "build/**"],
  },
  {
    files: ["src/bun/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
    },
    plugins: {
      effect: effectPlugin,
    },
    rules: {
      "effect/no-runpromise-without-catch": "error",
      "effect/no-throw-in-effect": "error",
      "effect/prefer-effect-over-trycatch": "error",
    },
  },
  // rpc.ts は Electrobun の RPC フレームワーク境界。
  // ハンドラ内の runPromise エラーはフレームワークがキャッチするため、
  // 個別の catch は不要。
  {
    files: ["src/bun/rpc.ts"],
    rules: {
      "effect/no-runpromise-without-catch": "off",
    },
  },
];
