import { motion } from "framer-motion";
import { cn } from "@/lib/utils.js";
import type { RecordingState } from "@shared/types.js";

/**
 * 録音の開始/停止を行う大型円形ボタン。
 * ボタン外形は常に円形(rounded-full)を維持し、パルスリングと形状を統一する。
 * 状態に応じて内部アイコンのみがモーフィングする:
 *   - idle: ● (円形アイコン)
 *   - recording: ■ (四角アイコン)
 *   - stopping: スピナー
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
      onClick={onClick}
      disabled={disabled || isStopping}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={cn(
        "relative z-10 flex h-20 w-20 items-center justify-center rounded-full transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        isStopping ? "bg-muted" : "bg-recording",
        (disabled || isStopping) && "cursor-not-allowed opacity-60",
      )}
      aria-label={isIdle ? "Start recording" : "Stop recording"}
    >
      {isStopping ? (
        <motion.div
          className="h-6 w-6 rounded-full border-2 border-muted-foreground border-t-transparent"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
        />
      ) : (
        <motion.div
          layoutId="record-icon"
          className={cn(
            "bg-recording-foreground",
            isIdle ? "h-6 w-6 rounded-full" : "h-6 w-6 rounded-sm",
          )}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
      )}
    </motion.button>
  );
}
