import { UpdateNotification } from "./components/UpdateNotification.js";
import { RecordingView } from "./views/RecordingView.js";
import { LibrarySidebar } from "./views/LibrarySidebar.js";
import {
  useRecordingStore,
  selectRecordingState,
} from "./stores/recordingStore.js";

/**
 * メインレイアウト: 左に録音エリア、右にライブラリサイドバーを常時表示。
 * 録音しながら過去の録音一覧を確認できる 2 ペイン構成。
 */
export default function App() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* タイトルバー — Electrobun ウィンドウのドラッグ領域 */}
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-border/70 bg-surface px-4">
        <div className="flex items-center gap-2.5">
          <BrandMark />
          <h1 className="text-[13px] font-semibold tracking-tight text-foreground">
            Cross Recorder
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <LiveStatus />
          <UpdateNotification />
        </div>
      </header>

      {/* メインコンテンツ: サイドバー(左) + 録音エリア(右) */}
      <div className="flex flex-1 overflow-hidden">
        <LibrarySidebar />
        <main className="flex-1 overflow-hidden">
          <RecordingView />
        </main>
      </div>
    </div>
  );
}

/** アプリのブランドマーク（赤い録音ドットを内包した角丸タイル） */
function BrandMark() {
  return (
    <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-elevated to-secondary shadow-card">
      <span className="h-2.5 w-2.5 rounded-full bg-recording shadow-[0_0_8px_hsl(var(--recording))]" />
    </div>
  );
}

/** ミリ秒 → "HH:MM:SS" */
function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

/** 録音中だけタイトルバー右側に表示する LIVE インジケータ */
function LiveStatus() {
  const sessionState = useRecordingStore((s) => s.sessionState);
  const elapsedMs = useRecordingStore((s) => s.elapsedMs);
  const recordingState = selectRecordingState(sessionState);

  if (recordingState !== "recording") return null;

  return (
    <div className="flex animate-fade-in items-center gap-2 rounded-full border border-recording/30 bg-recording/10 py-1 pl-2 pr-3">
      <span className="h-1.5 w-1.5 animate-live-dot rounded-full bg-recording" />
      <span className="text-[10px] font-semibold uppercase tracking-widest text-recording">
        Rec
      </span>
      <span className="font-mono text-[11px] tabular-nums text-foreground/90">
        {formatClock(elapsedMs)}
      </span>
    </div>
  );
}
