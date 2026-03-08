import { AnimatePresence, motion } from "framer-motion";
import { useViewStore } from "../stores/viewStore.js";
import {
  useRecordingStore,
  selectRecordingState,
} from "../stores/recordingStore.js";
import { useRecording } from "../hooks/useRecording.js";
import { useAudioLevel } from "../hooks/useAudioLevel.js";
import { PulseRings } from "../components/recording/PulseRings.js";
import { RecordButton } from "../components/recording/RecordButton.js";
import { AudioSourceControls } from "../components/recording/AudioSourceControls.js";
import { RecordingWaveform } from "../components/recording/RecordingWaveform.js";

/**
 * 録音画面。RecordButton, PulseRings, AudioSourceControls, RecordingWaveform を統合し、
 * 録音セッションのライフサイクル全体を1画面で管理する。
 *
 * レイアウト: ヘッダー(Library遷移) → 中央(RecordButton+PulseRings) → タイマー → 波形 → エラー → ソースコントロール
 */

/** 経過ミリ秒をHH:MM:SS形式にフォーマットする */
function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

export function RecordingView() {
  const setView = useViewStore((s) => s.setView);
  const { recordingState, startRecording, stopRecording } = useRecording();

  const sessionState = useRecordingStore((s) => s.sessionState);
  const elapsedMs = useRecordingStore((s) => s.elapsedMs);
  const recordings = useRecordingStore((s) => s.recordings);
  const micEnabled = useRecordingStore((s) => s.micEnabled);
  const systemAudioEnabled = useRecordingStore((s) => s.systemAudioEnabled);
  const recordingError = useRecordingStore((s) => s.recordingError);
  const micAnalyser = useRecordingStore((s) => s.micAnalyser);
  const systemAnalyser = useRecordingStore((s) => s.systemAnalyser);
  const nativeSystemLevel = useRecordingStore((s) => s.nativeSystemLevel);

  const micLevel = useAudioLevel(micAnalyser);
  const webSystemLevel = useAudioLevel(systemAnalyser);
  /** ネイティブキャプチャ時はnativeSystemLevelを、WebAPI時はwebSystemLevelを使用 */
  const systemLevel = systemAnalyser ? webSystemLevel : nativeSystemLevel;

  const isRecording = recordingState === "recording";
  const isIdle = recordingState === "idle";
  const noSourceSelected = !micEnabled && !systemAudioEnabled;

  const handleRecordClick = () => {
    if (isIdle) {
      startRecording();
    } else if (isRecording) {
      stopRecording();
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* ナビゲーションヘッダー */}
      <div className="flex items-center justify-end px-4 py-3">
        <button
          onClick={() => setView("library")}
          className="text-sm font-medium text-playback transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-sm"
        >
          Library{recordings.length > 0 ? ` (${recordings.length})` : ""}
          <span className="ml-1" aria-hidden>
            &rarr;
          </span>
        </button>
      </div>

      {/* 中央コンテンツ — RecordButton + タイマー + 波形 */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
        {/* RecordButton + PulseRings */}
        <div className="relative flex items-center justify-center">
          <PulseRings
            isRecording={isRecording}
            micLevel={micLevel}
            systemLevel={systemLevel}
          />
          <RecordButton
            state={recordingState}
            disabled={isIdle && noSourceSelected}
            onClick={handleRecordClick}
          />
        </div>

        {/* タイマー */}
        <p
          className="font-mono text-2xl tabular-nums tracking-wider text-foreground"
          aria-live="polite"
          aria-atomic
        >
          {formatTime(elapsedMs)}
        </p>

        {/* 波形 — 録音中のみ表示 */}
        <div className="w-full max-w-sm">
          <RecordingWaveform
            micLevel={micLevel}
            systemLevel={systemLevel}
            isRecording={isRecording}
          />
        </div>

        {/* エラーメッセージ */}
        <AnimatePresence>
          {recordingError && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="max-w-sm text-center text-sm text-destructive"
              role="alert"
            >
              {recordingError}
            </motion.p>
          )}
        </AnimatePresence>

        {/* 状態テキスト — acquiring時 */}
        {sessionState.type === "acquiring" && (
          <p className="text-sm text-muted-foreground">
            Acquiring audio devices...
          </p>
        )}

        {/* degraded 状態の警告 */}
        {sessionState.type === "degraded" && (
          <p className="text-sm text-muted-foreground">
            Recording with {sessionState.activeTracks.join(" + ")} only
          </p>
        )}
      </div>

      {/* ソースコントロール */}
      <AudioSourceControls disabled={!isIdle} />
    </div>
  );
}
