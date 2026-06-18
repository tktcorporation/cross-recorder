---
"cross-recorder": patch
---

依存パッケージを更新。マイナー/パッチ更新（electrobun, effect, framer-motion, oxlint, vitest, zustand, radix-ui 等）に加え、concurrently・@vitejs/plugin-react・vite・typescript をメジャー更新。TypeScript 6 / oxlint 1.70 の仕様変更に追従（deprecated な tsconfig `baseUrl` の削除、CSS side-effect import の型宣言追加、廃止された lint ルールの削除・置き換え）。
