import { UpdateNotification } from "./components/UpdateNotification.js";
import { RecordingView } from "./views/RecordingView.js";
import { LibrarySidebar } from "./views/LibrarySidebar.js";

/**
 * メインレイアウト: 左に録音エリア、右にライブラリサイドバーを常時表示。
 * 2ビュー切替型から変更し、録音しながら過去の録音一覧を確認できるようにした。
 */
export default function App() {
  return (
    <div className="flex min-h-screen flex-col overflow-hidden bg-background">
      {/* タイトルバー — Electrobun ウィンドウのドラッグ領域 */}
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-card/80 px-4">
        <h1 className="text-xs font-semibold tracking-wide text-foreground/80">
          Cross Recorder
        </h1>
        <UpdateNotification />
      </header>

      {/* メインコンテンツ: サイドバー(左) + 録音エリア(右) */}
      <div className="flex flex-1 overflow-hidden">
        {/* ライブラリサイドバー（左側・常時表示） */}
        <LibrarySidebar />

        {/* 録音エリア（メイン） */}
        <main className="flex-1 overflow-hidden">
          <RecordingView />
        </main>
      </div>
    </div>
  );
}
