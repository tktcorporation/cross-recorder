import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRecordingStore } from "../stores/recordingStore.js";
import { useRpc } from "../hooks/useRpc.js";
import { ScrollArea } from "../components/ui/scroll-area.js";
import { RecordingCard } from "../components/library/RecordingCard.js";
import { Button } from "../components/ui/button.js";
import { SettingsPanel } from "../components/settings/SettingsPanel.js";
import { SettingsIcon, MicOffIcon } from "../components/ui/icons.js";
import { cn } from "@/lib/utils.js";

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
    <aside className="flex w-80 min-w-[20rem] shrink-0 flex-col overflow-hidden border-r border-border bg-surface">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-3.5">
        <div className="flex items-baseline gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/80">
            Library
          </h2>
          {recordings.length > 0 && (
            <span className="rounded-full bg-elevated px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
              {recordings.length}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowSettings((v) => !v)}
          className={cn(
            "h-7 w-7 p-0",
            showSettings && "bg-elevated text-foreground",
          )}
          title="Settings"
          aria-pressed={showSettings}
        >
          <SettingsIcon className="h-[15px] w-[15px]" />
        </Button>
      </div>

      {/* 設定パネル */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="overflow-hidden border-y border-border bg-card/40"
          >
            <div className="px-3 py-3">
              <SettingsPanel onClose={() => setShowSettings(false)} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* コンテンツ */}
      {recordings.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-muted-foreground/70">
            <MicOffIcon className="h-5 w-5" />
          </div>
          <div className="flex flex-col items-center gap-1">
            <p className="text-center text-sm font-medium text-foreground/80">
              No recordings yet
            </p>
            <p className="max-w-[14rem] text-center text-xs leading-relaxed text-muted-foreground">
              Hit the record button to capture your first session — it&apos;ll
              show up here.
            </p>
          </div>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-2 px-3 py-3">
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
