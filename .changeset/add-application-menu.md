---
"cross-recorder": patch
---

fix: ApplicationMenu を追加して Cmd+Q でアプリが終了するように修正

- Electrobun の ApplicationMenu.setApplicationMenu() を設定し、Cmd+Q (Quit) および Edit 系ショートカット (Cmd+C/V/X/Z/A) を有効化
