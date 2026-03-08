import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useViewStore } from "../stores/viewStore.js";
import { useRecordingStore } from "../stores/recordingStore.js";
import { useRpc } from "../hooks/useRpc.js";
import { ScrollArea } from "../components/ui/scroll-area.js";
import { Button } from "../components/ui/button.js";
import { RecordingCard } from "../components/library/RecordingCard.js";

/**
 * ライブラリ画面。録音一覧をカードリストで表示し、カード展開で再生可能にする。
 *
 * 背景: 録音画面 (RecordingView) から遷移して過去の録音を閲覧・再生・削除する画面。
 * マウント時に RPC 経由で録音一覧を取得し、Zustand ストアに保存する。
 *
 * 対になるビュー: RecordingView (録音画面)
 */
export function LibraryView() {
  const setView = useViewStore((s) => s.setView);
  const { request } = useRpc();
  const recordings = useRecordingStore((s) => s.recordings);
  const setRecordings = useRecordingStore((s) => s.setRecordings);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  // マウント時に録音一覧を取得
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

  const handleBack = () => {
    setView("recording");
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* ヘッダー */}
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          className="text-muted-foreground hover:text-foreground"
        >
          &larr; Back
        </Button>
        <h1 className="text-sm font-semibold tracking-tight text-foreground">Library</h1>
        <span className="min-w-[60px] text-right text-xs text-muted-foreground">
          {recordings.length > 0 ? `${recordings.length}` : ""}
        </span>
      </header>

      {/* コンテンツ */}
      {recordings.length === 0 ? (
        /* 空状態 */
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
          <p className="text-sm text-muted-foreground">No recordings yet</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setView("recording")}
          >
            Start recording
          </Button>
        </div>
      ) : (
        /* カードリスト */
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-3 p-4">
            <AnimatePresence initial={false}>
              {recordings.map((recording) => (
                <motion.div
                  key={recording.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
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
    </div>
  );
}
