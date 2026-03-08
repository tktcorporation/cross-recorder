import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useViewStore } from "../stores/viewStore.js";
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
 * 録音画面。RecordButton, PulseRings, AudioSourceControls, RecordingWaveform を統合し、
 * 録音セッションのライフサイクル全体を1画面で管理する。
 *
 * 録音停止後は PostRecordingPlayer を表示し、その場で録音結果を再生・確認できる。
 * 新規録音開始時または「View in Library」クリック時に PostRecordingPlayer を閉じる。
 *
 * レイアウト: ヘッダー(Library遷移) → 中央(RecordButton+PulseRings) → タイマー → 波形/PostRecordingPlayer → エラー → ソースコントロール
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

  /**
   * 録音停止後に表示する直前の録音。
   * stopping → idle 遷移時に recordings 配列の先頭（最新）を設定し、
   * 新規録音開始時や「View in Library」遷移時にクリアする。
   */
  const [lastRecording, setLastRecording] =
    useState<RecordingMetadata | null>(null);
  /**
   * 直前の recordingState を追跡し、stopping → idle 遷移を検出する。
   * useRef を使うことで再レンダリングを発生させずに前回値を保持する。
   */
  const prevRecordingStateRef = useRef(recordingState);

  // stopping → idle 遷移を検出し、最新の録音を PostRecordingPlayer に渡す
  useEffect(() => {
    const prevState = prevRecordingStateRef.current;
    prevRecordingStateRef.current = recordingState;

    if (prevState === "stopping" && recordingState === "idle") {
      // recordings は新しい順 (addRecording が先頭に追加) なので [0] が最新
      if (recordings.length > 0) {
        setLastRecording(recordings[0]!);
      }
    }
  }, [recordingState, recordings]);

  const handleRecordClick = () => {
    if (isIdle) {
      // 新規録音開始時に PostRecordingPlayer を閉じる
      setLastRecording(null);
      startRecording();
    } else if (isRecording) {
      stopRecording();
    }
  };

  /**
   * 「View in Library」クリック時: PostRecordingPlayer を閉じてライブラリへ遷移。
   * onDismiss コールバックとして PostRecordingPlayer に渡す。
   */
  const handleViewInLibrary = () => {
    setLastRecording(null);
    setView("library");
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

        {/* 波形 — 録音中のみ表示 / 停止後は PostRecordingPlayer を表示 */}
        <div className="w-full max-w-sm">
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
                onDismiss={handleViewInLibrary}
              />
            ) : null}
          </AnimatePresence>
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
