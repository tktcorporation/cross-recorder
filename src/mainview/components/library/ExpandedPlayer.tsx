import { useCallback, useEffect, useRef, useState } from "react";
import { useRpc } from "../../hooks/useRpc.js";
import { useRecordingStore } from "../../stores/recordingStore.js";
import { useWaveformData } from "../../hooks/useWaveformData.js";
import { WaveformTrack } from "../WaveformTrack.js";
import { PlaybackController } from "../../audio/PlaybackController.js";
import { Button } from "../ui/button.js";
import type { RecordingMetadata, TrackInfo } from "@shared/types.js";

/**
 * RecordingCard 展開時に表示される再生プレーヤー。
 *
 * 背景: WaveformPlayer と同じ再生ロジック (fetchTrackBuffer, PlaybackController) を
 * 使用するが、カード内に埋め込まれる形で表示される。マウント時に音声データを取得し、
 * アンマウント時にリソースを解放する。
 *
 * 呼び出し元: RecordingCard (展開時)
 */

const TRACK_HEIGHT = 40;
const BAR_WIDTH = 2;
const BAR_GAP = 1;

type Props = {
  recording: RecordingMetadata;
};

/** 秒 → "M:SS" */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * RPC 経由で音声ファイルの base64 データを取得し AudioBuffer にデコードする。
 * WaveformPlayer の fetchTrackBuffer と同一のパターン。
 */
async function fetchTrackBuffer(
  request: { getPlaybackData: (p: { filePath: string }) => Promise<{ data: string; mimeType: string }> },
  track: TrackInfo,
  audioContext: AudioContext,
): Promise<AudioBuffer> {
  const res = await request.getPlaybackData({ filePath: track.filePath });
  const binary = atob(res.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const copy = bytes.buffer.slice(0);
  return audioContext.decodeAudioData(copy);
}

/** トラック種別のラベル (例: "Mic (Mono)") */
function trackLabel(trackKind: string, channels: number): string {
  const kind = trackKind === "mic" ? "Mic" : "System";
  const ch = channels === 1 ? "Mono" : "Stereo";
  return `${kind} (${ch})`;
}

export function ExpandedPlayer({ recording }: Props) {
  const { request } = useRpc();
  const removeRecording = useRecordingStore((s) => s.removeRecording);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [audioBuffers, setAudioBuffers] = useState<AudioBuffer[]>([]);
  const [tracks, setTracks] = useState<TrackInfo[]>([]);
  const [containerWidth, setContainerWidth] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const controllerRef = useRef<PlaybackController | null>(null);
  const rafRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // コンテナ幅の監視（波形バー数の計算に使用）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const barCount = Math.max(1, Math.floor(containerWidth / (BAR_WIDTH + BAR_GAP)));
  const waveforms = useWaveformData(audioBuffers, barCount);

  const startTimeUpdates = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    const update = () => {
      const ctrl = controllerRef.current;
      if (ctrl) {
        setCurrentTime(ctrl.currentTime);
      }
      rafRef.current = requestAnimationFrame(update);
    };
    rafRef.current = requestAnimationFrame(update);
  }, []);

  const stopTimeUpdates = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
  }, []);

  const disposePlayback = useCallback(() => {
    stopTimeUpdates();
    controllerRef.current?.dispose();
    controllerRef.current = null;
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, [stopTimeUpdates]);

  // 音声データの読み込み（マウント時に自動実行）
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      disposePlayback();

      const ctx = new AudioContext();
      audioContextRef.current = ctx;

      // トラック情報がなければフォールバック（レガシー録音対応）
      const trackInfos =
        recording.tracks && recording.tracks.length > 0
          ? recording.tracks
          : [
              {
                trackKind: "mic" as const,
                fileName: recording.fileName,
                filePath: recording.filePath,
                channels: 2,
                fileSizeBytes: recording.fileSizeBytes,
              },
            ];

      const buffers = await Promise.all(
        trackInfos.map((track) => fetchTrackBuffer(request, track, ctx)),
      );

      if (cancelled) {
        ctx.close();
        return;
      }

      setTracks(trackInfos);
      setAudioBuffers(buffers);

      const controller = new PlaybackController(ctx, buffers);
      controllerRef.current = controller;
      setDuration(controller.duration);
      setIsLoading(false);

      controller.onEnded = () => {
        stopTimeUpdates();
        setIsPlaying(false);
        setCurrentTime(controller.duration);
      };
    };

    load().catch((err) => {
      console.error("Failed to load audio for playback:", err);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording.id]);

  // アンマウント時のクリーンアップ
  useEffect(() => {
    return () => {
      disposePlayback();
    };
  }, [disposePlayback]);

  const handlePlayPause = useCallback(() => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;

    if (isPlaying) {
      ctrl.pause();
      stopTimeUpdates();
      setIsPlaying(false);
      setCurrentTime(ctrl.currentTime);
    } else {
      // 末尾に達していたら最初から再生
      if (ctrl.currentTime >= ctrl.duration) {
        ctrl.play(0);
      } else {
        ctrl.play();
      }
      setIsPlaying(true);
      startTimeUpdates();
    }
  }, [isPlaying, startTimeUpdates, stopTimeUpdates]);

  const handleSeek = useCallback(
    (progress: number) => {
      const ctrl = controllerRef.current;
      if (!ctrl) return;

      const time = progress * ctrl.duration;
      ctrl.seek(time);
      setCurrentTime(time);

      if (isPlaying) {
        startTimeUpdates();
      }
    },
    [isPlaying, startTimeUpdates],
  );

  const handleOpenFolder = async () => {
    await request.openFileLocation({ filePath: recording.filePath });
  };

  const handleDelete = async () => {
    disposePlayback();
    await request.deleteRecording({ recordingId: recording.id });
    removeRecording(recording.id);
  };

  const progress = duration > 0 ? currentTime / duration : 0;

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
              label={tracks[i] ? trackLabel(tracks[i].trackKind, tracks[i].channels) : "Track"}
              bars={waveform.bars}
              progress={progress}
              height={TRACK_HEIGHT}
              onSeek={handleSeek}
            />
          ))}
        </div>
      )}

      {/* コントロール */}
      <div className="flex items-center gap-3">
        <Button
          variant="default"
          size="icon"
          onClick={handlePlayPause}
          disabled={isLoading}
          className="h-8 w-8 shrink-0 rounded-full bg-playback text-playback-foreground hover:bg-playback/90"
        >
          {isLoading ? "..." : isPlaying ? "\u23F8" : "\u25B6"}
        </Button>

        <span className="font-mono text-xs text-muted-foreground">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        <div className="flex-1" />

        {/* アクションボタン */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleOpenFolder}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Open folder
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          className="text-xs text-muted-foreground hover:text-destructive"
        >
          Delete
        </Button>
      </div>
    </div>
  );
}
