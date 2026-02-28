# Auto Updater 実装計画

## Context

Cross Recorder に自動更新機能を追加する。Electrobun v1.14.4 には `Updater` クラスが組み込まれており、`checkForUpdate()` → `downloadUpdate()` → `applyUpdate()` の3ステップ API が利用可能。配信は GitHub Releases を使用する。

現状の release.yml は changeset ベースでビルド → GitHub Release 作成まで対応しているが、Electrobun Updater が必要とするファイル（`{platformPrefix}-update.json` や `.tar.zst` バンドル）は生成していない。

## 実装内容

### 1. RPC スキーマに auto-update メソッドを追加

**ファイル:** `src/shared/rpc-schema.ts`

bun 側に追加するリクエスト:
```
checkForUpdate → { version, updateAvailable, error }
downloadUpdate → { success, error }
applyUpdate    → { success, error }
getAppVersion  → { version, channel }
```

webview 側に追加するメッセージ:
```
updateStatus → { status: UpdateStatusType, message: string, progress?: number }
```

### 2. Bun 側に Updater サービスを追加

**新規ファイル:** `src/bun/services/UpdateService.ts`

- `Updater` を `electrobun/bun` からインポート
- `Updater.onStatusChange()` でステータス変更を監視し、RPC 経由で webview に通知
- 各 RPC ハンドラを実装（checkForUpdate, downloadUpdate, applyUpdate, getAppVersion）
- アプリ起動時に自動で更新チェックを実行（遅延付き、例: 5秒後）

**ファイル:** `src/bun/rpc.ts`

- 新しい RPC ハンドラを追加

### 3. Webview 側に更新 UI を追加

**新規ファイル:** `src/mainview/stores/updateStore.ts`

Zustand store:
- `updateStatus`: idle / checking / available / downloading / ready / error
- `updateVersion`: 利用可能なバージョン
- `progress`: ダウンロード進捗 (0-100)
- `errorMessage`: エラーメッセージ
- `currentVersion`: 現在のアプリバージョン

**新規ファイル:** `src/mainview/components/UpdateNotification.tsx`

- ヘッダーバーに小さな更新通知バッジを表示
- 「更新あり」→ クリックで「ダウンロード」→ 「再起動して更新」の流れ
- ダウンロード中はプログレスバーを表示
- エラー時はリトライ可能

**ファイル:** `src/mainview/App.tsx`

- `<UpdateNotification />` をヘッダー部分に追加

**ファイル:** `src/mainview/rpc.ts`

- `updateStatus` メッセージハンドラを追加

### 4. electrobun.config.ts のバージョン同期

**ファイル:** `electrobun.config.ts`

- `version` を `"0.1.0"` → `"0.3.0"` に修正（package.json と同期）

### 5. GitHub Actions release.yml を更新

**ファイル:** `.github/workflows/release.yml`

`create-release` ジョブに以下を追加:

1. ビルド出力から `Resources/version.json` の hash を取得
2. 各プラットフォーム向けに `{channel}-{os}-{arch}-update.json` を生成
3. ビルド済み tar を zstd 圧縮して `{channel}-{os}-{arch}-{appName}.tar.zst` としてアップロード
4. GitHub Release にこれらのファイルも添付

**baseUrl パターン:** `https://github.com/tktcorporation/cross-recorder/releases/latest/download`
- `latest/download` を使うことで常に最新リリースを参照可能

### 6. Shared types に Update 関連の型を追加

**ファイル:** `src/shared/types.ts`

```typescript
export type UpdateStatus = "idle" | "checking" | "available" | "downloading" | "ready" | "applying" | "error";
```

## 修正対象ファイル一覧

| ファイル | 操作 |
|---------|------|
| `src/shared/rpc-schema.ts` | 編集 |
| `src/shared/types.ts` | 編集 |
| `src/bun/services/UpdateService.ts` | 新規 |
| `src/bun/rpc.ts` | 編集 |
| `src/bun/index.ts` | 編集 |
| `src/mainview/stores/updateStore.ts` | 新規 |
| `src/mainview/components/UpdateNotification.tsx` | 新規 |
| `src/mainview/App.tsx` | 編集 |
| `src/mainview/rpc.ts` | 編集 |
| `electrobun.config.ts` | 編集 |
| `.github/workflows/release.yml` | 編集 |

## 検証方法

1. `pnpm typecheck` で型エラーがないことを確認
2. `pnpm test` で既存テストが通ることを確認
3. dev channel ではアップデートチェックが自動スキップされる動作を確認（Updater の仕様）
4. UI コンポーネントが正しくレンダリングされることを確認
