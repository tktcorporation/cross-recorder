import { motion } from "framer-motion";
import { cn } from "@/lib/utils.js";
import type { RecordingState } from "@shared/types.js";

/**
 * 録音の開始/停止を行う大型円形ボタン。
 * 状態に応じて形状・色・アイコンがモーフィングする:
 *   - idle: 赤い円 + ● アイコン
 *   - recording: 赤い角丸四角 + ■ アイコン
 *   - stopping: グレー角丸四角 + スピナー
 *
 * Framer Motion の layout prop でスムーズな形状遷移を実現。
 */
type RecordButtonProps = {
  state: RecordingState;
  disabled?: boolean;
  onClick: () => void;
};

export function RecordButton({ state, disabled, onClick }: RecordButtonProps) {
  const isIdle = state === "idle";
  const isStopping = state === "stopping";

  return (
    <motion.button
      layout
      onClick={onClick}
      disabled={disabled || isStopping}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={cn(
        "relative z-10 flex h-20 w-20 items-center justify-center transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        isIdle
          ? "rounded-full bg-recording"
          : isStopping
            ? "rounded-2xl bg-muted"
            : "rounded-2xl bg-recording",
        (disabled || isStopping) && "cursor-not-allowed opacity-60",
      )}
      aria-label={isIdle ? "録音開始" : "録音停止"}
    >
      {isStopping ? (
        /* スピナー — 停止処理中 */
        <motion.div
          className="h-6 w-6 rounded-full border-2 border-muted-foreground border-t-transparent"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
        />
      ) : isIdle ? (
        /* ● 録音開始アイコン */
        <motion.div
          layoutId="record-icon"
          className="h-6 w-6 rounded-full bg-recording-foreground"
        />
      ) : (
        /* ■ 録音停止アイコン */
        <motion.div
          layoutId="record-icon"
          className="h-6 w-6 rounded-sm bg-recording-foreground"
        />
      )}
    </motion.button>
  );
}
