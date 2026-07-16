import { motion } from "framer-motion";
import {
  PLAYBACK_TRACK_HEIGHT,
  useTrackPlayback,
} from "../../hooks/useTrackPlayback.js";
import { WaveformTrack } from "../WaveformTrack.js";
import { Button } from "../ui/button.js";
import { PlayIcon, PauseIcon, ArrowRightIcon } from "../ui/icons.js";
import {
  channelsLabel,
  formatPlaybackTime,
  trackKindLabel,
} from "@/lib/format.js";
import type { RecordingMetadata } from "@shared/types.js";

/**
 * 録音停止直後に表示されるインライン再生プレーヤー。
 *
 * 背景: 録音完了後にライブラリへ遷移せず、その場で録音結果を確認できるようにする。
 * 音声データの取得・再生制御・波形計算は useTrackPlayback を通じて
 * ExpandedPlayer (ライブラリ側の再生UI) と共有する。
 *
 * 呼び出し元: RecordingView (録音停止後、idle 状態で最新録音がある場合)
 */

type Props = {
  recording: RecordingMetadata;
  /** PostRecordingPlayer を閉じる（新規録音開始時やナビゲーション時に呼ばれる） */
  onDismiss: () => void;
};

export function PostRecordingPlayer({ recording, onDismiss }: Props) {
  const {
    containerRef,
    isLoading,
    isPlaying,
    currentTime,
    duration,
    progress,
    tracks,
    waveforms,
    playPause,
    seek,
  } = useTrackPlayback(recording);

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-card"
    >
      {/* 波形表示 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <span className="text-xs text-muted-foreground">Loading...</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {waveforms.map((waveform, i) => (
            <WaveformTrack
              key={tracks[i]?.trackKind ?? i}
              label={
                tracks[i]
                  ? `${trackKindLabel(tracks[i].trackKind)} (${channelsLabel(tracks[i].channels)})`
                  : "Track"
              }
              bars={waveform.bars}
              progress={progress}
              height={PLAYBACK_TRACK_HEIGHT}
              onSeek={seek}
            />
          ))}
        </div>
      )}

      {/* コントロール: Play/Pause + 時間 + View in Library */}
      <div className="flex items-center gap-3">
        <Button
          variant="default"
          size="icon"
          onClick={playPause}
          disabled={isLoading}
          className="h-9 w-9 shrink-0 rounded-full bg-playback text-playback-foreground shadow-glow-playback hover:bg-playback/90"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <PauseIcon className="h-4 w-4" />
          ) : (
            <PlayIcon className="h-4 w-4 translate-x-[1px]" />
          )}
        </Button>

        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {formatPlaybackTime(currentTime)} / {formatPlaybackTime(duration)}
        </span>

        <div className="flex-1" />

        <Button
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          className="text-xs"
        >
          View in Library
          <ArrowRightIcon className="h-3.5 w-3.5" />
        </Button>
      </div>
    </motion.div>
  );
}
