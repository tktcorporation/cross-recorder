import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRecordingStore } from "../stores/recordingStore.js";
import { useRpc } from "../hooks/useRpc.js";
import { ScrollArea } from "../components/ui/scroll-area.js";
import { RecordingCard } from "../components/library/RecordingCard.js";

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
    <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-card">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Recordings
        </h2>
        {recordings.length > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {recordings.length}
          </span>
        )}
      </div>

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
