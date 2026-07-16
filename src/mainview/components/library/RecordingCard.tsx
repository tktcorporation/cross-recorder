import { AnimatePresence, motion } from "framer-motion";
import { Card, CardHeader, CardContent } from "../ui/card.js";
import { Badge } from "../ui/badge.js";
import { cn } from "@/lib/utils.js";
import {
  channelsLabel,
  formatDurationMs,
  formatFileSize,
  formatRecordedAt,
  trackKindLabel,
} from "@/lib/format.js";
import { ExpandedPlayer } from "./ExpandedPlayer.js";
import type { RecordingMetadata } from "@shared/types.js";

/**
 * 録音カードコンポーネント。ライブラリ画面でカードリストの1項目を表示する。
 *
 * 背景: ライブラリ画面では各録音をカード形式で一覧し、クリックで展開して
 * 波形再生 (ExpandedPlayer) を表示する。1度に1枚だけ展開される。
 *
 * 呼び出し元: LibraryView
 */

type Props = {
  recording: RecordingMetadata;
  isExpanded: boolean;
  onToggleExpand: () => void;
};

/**
 * ミニ波形プレビュー。装飾用のバーパターンを表示する。
 * 実際の音声データは使わず、擬似的な高さパターンで視覚的なアクセントとする。
 */
function MiniWaveform() {
  // 擬似的な高さパターン（0〜1）
  const pattern = [0.3, 0.5, 0.8, 1.0, 0.7, 0.9, 0.4, 0.6, 0.85, 0.5, 0.7, 0.95, 0.6, 0.4, 0.3];
  return (
    <div className="flex items-center gap-[1px]" aria-hidden="true">
      {pattern.map((h, i) => (
        <div
          key={i}
          className="w-[2px] rounded-full bg-playback/60"
          style={{ height: `${h * 16}px` }}
        />
      ))}
    </div>
  );
}

export function RecordingCard({ recording, isExpanded, onToggleExpand }: Props) {
  const hasTracks = recording.tracks && recording.tracks.length > 0;

  return (
    <motion.div layout transition={{ type: "spring", stiffness: 300, damping: 30 }}>
      <Card
        className={cn(
          "overflow-hidden transition-all duration-200",
          isExpanded
            ? "border-playback/40 shadow-card-hover"
            : "hover:-translate-y-px hover:border-elevated hover:shadow-card-hover",
        )}
      >
        {/* クリック可能なヘッダー部分 */}
        <CardHeader
          className="cursor-pointer select-none p-3 transition-colors hover:bg-elevated/40"
          onClick={onToggleExpand}
        >
          <div className="flex items-center gap-3">
            <MiniWaveform />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-card-foreground">
                {recording.fileName}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatRecordedAt(recording.createdAt)}
                {" \u00B7 "}
                {formatDurationMs(recording.durationMs)}
                {" \u00B7 "}
                {formatFileSize(recording.fileSizeBytes)}
              </p>
            </div>
            {hasTracks && (
              <div className="flex shrink-0 gap-1">
                {recording.tracks.map((track) => (
                  <Badge key={track.trackKind} variant="secondary" className="text-[10px]">
                    {trackKindLabel(track.trackKind)} / {channelsLabel(track.channels)}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardHeader>

        {/* 展開時のプレーヤー */}
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              key="expanded"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="overflow-hidden"
            >
              <CardContent className="border-t border-border p-4">
                <ExpandedPlayer recording={recording} />
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}
