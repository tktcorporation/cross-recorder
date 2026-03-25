/**
 * oxlint 設定ファイル — defineConfig を使用して JS カスタムプラグインを有効化。
 *
 * 背景: oxlint の JSON config (.oxlintrc.json) では jsPlugins フィールドが
 * Rust ネイティブバイナリに渡されず silent ignore される。
 * JS config (defineConfig) 経由であれば loadPlugin コールバックが発火し、
 * カスタムプラグインが正しくロードされる。
 */
import { defineConfig } from "oxlint";

export default defineConfig({
  jsPlugins: ["./src/lint/effect-plugin.mjs"],
  rules: {
    // --- カスタム Effect ルール ---
    "effect/no-runpromise-without-catch": "error",
    "effect/no-throw-in-effect": "error",
    "effect/prefer-effect-over-trycatch": "error",
    // --- 汎用ルール ---
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
    "no-return-await": "warn",
  },
  overrides: [
    // rpc.ts は Electrobun の RPC フレームワーク境界。
    // ハンドラ内の runPromise エラーはフレームワークがキャッチするため、
    // 個別の catch は不要。
    {
      files: ["src/bun/rpc.ts"],
      rules: {
        "effect/no-runpromise-without-catch": "off",
      },
    },
  ],
  ignorePatterns: ["dist", "node_modules", "*.worklet.js"],
});
