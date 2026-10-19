---
"cross-recorder": patch
---

依存パッケージを範囲内で更新し、既知の脆弱性を解消した。

- shell-quote（critical）、js-yaml・postcss・source-map-js 経由の既知脆弱性を、修正版を含む版へ更新して解消
- Radix UI・framer-motion・effect・vite・vitest・oxlint などを patch / minor の範囲で更新
- 不要になった picomatch の pnpm override を削除
