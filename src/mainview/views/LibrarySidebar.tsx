import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRecordingStore } from "../stores/recordingStore.js";
import { useRpc } from "../hooks/useRpc.js";
import { ScrollArea } from "../components/ui/scroll-area.js";
import { RecordingCard } from "../components/library/RecordingCard.js";
import { Button } from "../components/ui/button.js";
import { SettingsPanel } from "../components/settings/SettingsPanel.js";

/**
 * 録音一覧を表示するサイドバー。画面右側に常時表示される。
 * マウント時に RPC で録音一覧を取得し、カードリストで表示する。
 * カードをクリックすると展開して再生UIが表示される。
 */
export function LibrarySidebar() {
  const { request } = useRpc();
  const recordings = useRecordingStore((s) => s.recordings);
  const setRecordings = useRecordingStore((s) => s.setRecordings);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    request
      .getRecordings({})
      .then((res) => {
        if (Array.isArray(res)) {
          setRecordings(res);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch recordings:", err);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <aside className="flex w-80 min-w-[20rem] shrink-0 flex-col overflow-hidden border-r border-border bg-card">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Recordings
        </h2>
        <div className="flex items-center gap-2">
          {recordings.length > 0 && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {recordings.length}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSettings((v) => !v)}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
            title="Settings"
          >
            {/* Gear icon (SVG) */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </Button>
        </div>
      </div>

      {/* 設定パネル */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden border-b border-border"
          >
            <div className="px-3 py-3">
              <SettingsPanel onClose={() => setShowSettings(false)} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* コンテンツ */}
      {recordings.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4">
          <p className="text-center text-xs text-muted-foreground">
            No recordings yet
          </p>
          <p className="text-center text-[11px] text-muted-foreground/60">
            Start recording to see your files here
          </p>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-2 px-3 pb-3">
            <AnimatePresence initial={false}>
              {recordings.map((recording) => (
                <motion.div
                  key={recording.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                >
                  <RecordingCard
                    recording={recording}
                    isExpanded={expandedId === recording.id}
                    onToggleExpand={() => handleToggleExpand(recording.id)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </ScrollArea>
      )}
    </aside>
  );
}
