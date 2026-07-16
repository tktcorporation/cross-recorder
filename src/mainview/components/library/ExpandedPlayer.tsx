import { useCallback, useEffect, useState } from "react";
import { useRpc } from "../../hooks/useRpc.js";
import { useRecordingStore } from "../../stores/recordingStore.js";
import {
  PLAYBACK_TRACK_HEIGHT,
  useTrackPlayback,
} from "../../hooks/useTrackPlayback.js";
import { WaveformTrack } from "../WaveformTrack.js";
import { bytesToBase64, exportTracks } from "../../audio/AudioExporter.js";
import { Button } from "../ui/button.js";
import {
  PlayIcon,
  PauseIcon,
  SparkleIcon,
  DownloadIcon,
  FolderIcon,
  TrashIcon,
} from "../ui/icons.js";
import {
  channelsLabel,
  formatPlaybackTime,
  trackKindLabel,
} from "@/lib/format.js";
import type {
  ExportFormat,
  RecordingMetadata,
  TranscriptionResult,
} from "@shared/types.js";

/**
 * RecordingCard 展開時に表示される再生プレーヤー。
 *
 * 背景: 音声データの取得・再生制御・波形計算は useTrackPlayback を通じて
 * PostRecordingPlayer と共有する。このコンポーネントはカード内に埋め込まれる形で
 * 表示され、Transcribe/Export/Delete 等のライブラリ固有の操作を追加で提供する。
 *
 * 呼び出し元: RecordingCard (展開時)
 */

type Props = {
  recording: RecordingMetadata;
};

export function ExpandedPlayer({ recording }: Props) {
  const { request } = useRpc();
  const removeRecording = useRecordingStore((s) => s.removeRecording);

  const {
    containerRef,
    isLoading,
    isPlaying,
    currentTime,
    duration,
    progress,
    tracks,
    audioBuffers,
    waveforms,
    playPause,
    seek,
    dispose,
  } = useTrackPlayback(recording);

  // 文字起こし関連の状態
  const [transcription, setTranscription] = useState<TranscriptionResult | null>(
    recording.transcription ?? null,
  );
  const [isTranscribing, setIsTranscribing] = useState(false);

  // エクスポート関連の状態。実行中はフォーマットを保持し、二重実行を防ぐ。
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(
    null,
  );
  const [exportResult, setExportResult] = useState<
    { ok: true; filePath: string } | { ok: false; error: string } | null
  >(null);

  // バックエンドからの文字起こし進捗通知を受け取る
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        recordingId: string;
        result: TranscriptionResult;
      };
      if (detail.recordingId === recording.id) {
        setTranscription(detail.result);
        setIsTranscribing(detail.result.status === "transcribing");
      }
    };
    window.addEventListener("transcription-status", handler);
    return () => window.removeEventListener("transcription-status", handler);
  }, [recording.id]);

  const handleTranscribe = useCallback(async () => {
    // mic トラックを優先、なければ最初のトラックを使う
    const targetTrack =
      tracks.find((t) => t.trackKind === "mic") ?? tracks[0];
    if (!targetTrack) return;

    setIsTranscribing(true);
    setTranscription({ status: "transcribing", trackKind: targetTrack.trackKind });

    try {
      const result = await request.transcribeRecording({
        recordingId: recording.id,
        trackKind: targetTrack.trackKind,
      });
      setTranscription(result);
    } catch (err) {
      setTranscription({
        status: "error",
        error: String(err),
      });
    } finally {
      setIsTranscribing(false);
    }
  }, [recording.id, request, tracks]);

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      if (audioBuffers.length === 0 || exportingFormat !== null) return;

      setExportingFormat(format);
      setExportResult(null);
      try {
        const bytes = await exportTracks(audioBuffers, format);
        const { filePath } = await request.exportRecording({
          fileName: recording.fileName,
          format,
          data: bytesToBase64(bytes),
        });
        setExportResult({ ok: true, filePath });
      } catch (err) {
        setExportResult({ ok: false, error: String(err) });
      } finally {
        setExportingFormat(null);
      }
    },
    [audioBuffers, exportingFormat, recording.fileName, request],
  );

  const handleOpenFolder = async () => {
    await request.openFileLocation({ filePath: recording.filePath });
  };

  const handleDelete = async () => {
    dispose();
    await request.deleteRecording({ recordingId: recording.id });
    removeRecording(recording.id);
  };

  return (
    <div ref={containerRef} className="flex flex-col gap-3">
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

      {/* コントロール */}
      <div className="flex flex-col gap-2">
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
        </div>

        {/* アクションボタン — 折り返し可能にして幅が狭くても潰れないようにする */}
        <div className="flex flex-wrap gap-1 border-t border-border/60 pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleTranscribe}
            disabled={isLoading || isTranscribing || tracks.length === 0}
            className="px-2 text-xs"
          >
            <SparkleIcon className="h-3.5 w-3.5" />
            {isTranscribing ? "Transcribing..." : "Transcribe"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleExport("wav")}
            disabled={isLoading || exportingFormat !== null}
            className="px-2 text-xs"
          >
            <DownloadIcon className="h-3.5 w-3.5" />
            {exportingFormat === "wav" ? "Exporting..." : "WAV"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleExport("mp3")}
            disabled={isLoading || exportingFormat !== null}
            className="px-2 text-xs"
          >
            <DownloadIcon className="h-3.5 w-3.5" />
            {exportingFormat === "mp3" ? "Exporting..." : "MP3"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpenFolder}
            className="px-2 text-xs"
          >
            <FolderIcon className="h-3.5 w-3.5" />
            Folder
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            className="px-2 text-xs hover:bg-destructive/10 hover:text-destructive"
          >
            <TrashIcon className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </div>

      {/* エクスポート結果 */}
      {exportResult?.ok && (
        <p className="text-xs text-muted-foreground">
          Exported to {exportResult.filePath}
        </p>
      )}
      {exportResult && !exportResult.ok && (
        <p className="text-xs text-destructive">
          Export failed: {exportResult.error}
        </p>
      )}

      {/* 文字起こし結果 */}
      {transcription && transcription.status === "done" && transcription.text && (
        <div className="rounded-lg border border-border bg-card/50 p-3">
          <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Transcription
          </h4>
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-card-foreground">
            {transcription.text}
          </p>
        </div>
      )}
      {transcription && transcription.status === "error" && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-xs text-destructive">
            {transcription.error}
          </p>
        </div>
      )}
    </div>
  );
}
