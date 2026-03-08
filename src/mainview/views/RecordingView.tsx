import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRecordingStore } from "../stores/recordingStore.js";
import { useRecording } from "../hooks/useRecording.js";
import { useAudioLevel } from "../hooks/useAudioLevel.js";
import { PulseRings } from "../components/recording/PulseRings.js";
import { RecordButton } from "../components/recording/RecordButton.js";
import { AudioSourceControls } from "../components/recording/AudioSourceControls.js";
import { RecordingWaveform } from "../components/recording/RecordingWaveform.js";
import { PostRecordingPlayer } from "../components/recording/PostRecordingPlayer.js";
import type { RecordingMetadata } from "@shared/types.js";

/**
 * 録音画面。左側メインエリアに表示される。
 * RecordButton + PulseRings を中央に大きく配置し、
 * 録音中は横スクロール波形、停止後は PostRecordingPlayer を表示する。
 */

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
  const systemLevel = systemAnalyser ? webSystemLevel : nativeSystemLevel;

  const isRecording = recordingState === "recording";
  const isIdle = recordingState === "idle";
  const noSourceSelected = !micEnabled && !systemAudioEnabled;

  const [lastRecording, setLastRecording] =
    useState<RecordingMetadata | null>(null);
  const prevRecordingStateRef = useRef(recordingState);

  useEffect(() => {
    const prevState = prevRecordingStateRef.current;
    prevRecordingStateRef.current = recordingState;

    if (prevState === "stopping" && recordingState === "idle") {
      if (recordings.length > 0) {
        setLastRecording(recordings[0]!);
      }
    }
  }, [recordingState, recordings]);

  const handleRecordClick = () => {
    if (isIdle) {
      setLastRecording(null);
      startRecording();
    } else if (isRecording) {
      stopRecording();
    }
  };

  const handleDismissPlayer = () => {
    setLastRecording(null);
  };

  return (
    <div className="flex h-full flex-col">
      {/* 中央コンテンツ — やや上寄りに配置 */}
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 pb-16">
        {/* RecordButton + PulseRings */}
        <div
          className="relative flex items-center justify-center"
          style={{ width: 160, height: 160 }}
        >
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
          className="font-mono text-3xl tabular-nums tracking-wider text-foreground"
          aria-live="polite"
          aria-atomic
        >
          {formatTime(elapsedMs)}
        </p>

        {/* 波形 / PostRecordingPlayer */}
        <div className="w-full max-w-md">
          <AnimatePresence mode="wait">
            {isRecording ? (
              <motion.div
                key="recording-waveform"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <RecordingWaveform
                  micLevel={micLevel}
                  systemLevel={systemLevel}
                  isRecording={isRecording}
                />
              </motion.div>
            ) : lastRecording ? (
              <PostRecordingPlayer
                key={`post-${lastRecording.id}`}
                recording={lastRecording}
                onDismiss={handleDismissPlayer}
              />
            ) : null}
          </AnimatePresence>
        </div>

        {/* エラー */}
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

        {sessionState.type === "acquiring" && (
          <p className="text-sm text-muted-foreground">
            Acquiring audio devices...
          </p>
        )}

        {sessionState.type === "degraded" && (
          <p className="text-sm text-muted-foreground">
            Recording with {sessionState.activeTracks.join(" + ")} only
          </p>
        )}

        {/* ソースコントロール — 録音ボタン近くに配置 */}
        <div className="w-full max-w-xs">
          <AudioSourceControls disabled={!isIdle} />
        </div>
      </div>
    </div>
  );
}
