---
"cross-recorder": patch
---

依存パッケージを更新し、既知の脆弱性を解消した。

- nanoid・vitest・postcss・autoprefixer・concurrently を、修正版を含むパッチ/マイナー版へ更新（負のサイズ指定時に nanoid の生成が無限ループしうる問題、postcss の低速単体テスト向け脆弱性、shell-quote の ReDoS など）
- Radix UI・zustand・effect・tailwind-merge 等の依存も安全なマイナー/パッチ更新を反映
- electrobun の依存チェーン（proxy-agent 経由）が引く `ip-address` の SSRF 境界回避の脆弱性（GHSA-mwp4-54f8-5fhr 他）は、そのチェーンが宣言する semver range 自体は既に修正版を許容しており、lockfile を再解決するだけで解消した（override は不要）
