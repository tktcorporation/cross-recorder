import { AnimatePresence, motion } from "framer-motion";
import { Card, CardHeader, CardContent } from "../ui/card.js";
import { Badge } from "../ui/badge.js";
import { cn } from "@/lib/utils.js";
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

/** ミリ秒 → "M:SS" */
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** バイト → "X.X MB" or "X.X KB" */
function formatFileSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(1)} KB`;
}

/** ISO文字列 → "YYYY/MM/DD HH:MM" */
function formatDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${y}/${mo}/${day} ${h}:${mi}`;
}

/** トラック種別のラベル文字列 (例: "Mic / Mono") */
function trackLabel(trackKind: string, channels: number): string {
  const kind = trackKind === "mic" ? "Mic" : "System";
  const ch = channels === 1 ? "Mono" : "Stereo";
  return `${kind} / ${ch}`;
}

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
          "overflow-hidden transition-colors",
          isExpanded && "border-playback/30",
        )}
      >
        {/* クリック可能なヘッダー部分 */}
        <CardHeader
          className="cursor-pointer select-none p-3 transition-colors hover:bg-accent/50"
          onClick={onToggleExpand}
        >
          <div className="flex items-center gap-3">
            <MiniWaveform />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium text-card-foreground">
                  {recording.fileName}
                </p>
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">
                  {formatDate(recording.createdAt)}
                </span>
                <span className="text-[11px] text-muted-foreground/40">&middot;</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {formatDuration(recording.durationMs)}
                </span>
                <span className="text-[11px] text-muted-foreground/40">&middot;</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {formatFileSize(recording.fileSizeBytes)}
                </span>
              </div>
              {/* バッジをメタ情報の下に移動 — 狭い幅でも溢れない */}
              {hasTracks && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {recording.tracks.map((track) => (
                    <Badge key={track.trackKind} variant="secondary" className="text-[10px]">
                      {trackLabel(track.trackKind, track.channels)}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
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
              <CardContent className="border-t border-border/50 p-3">
                <ExpandedPlayer recording={recording} />
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}
