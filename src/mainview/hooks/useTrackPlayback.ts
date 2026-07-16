import { useCallback, useEffect, useRef, useState } from "react";
import { useRpc } from "./useRpc.js";
import { useWaveformData } from "./useWaveformData.js";
import { PlaybackController } from "../audio/PlaybackController.js";
import type { RecordingMetadata, TrackInfo } from "@shared/types.js";

/** 波形バーの描画パラメータ。ExpandedPlayer / PostRecordingPlayer で共有する。 */
export const PLAYBACK_TRACK_HEIGHT = 40;
const BAR_WIDTH = 2;
const BAR_GAP = 1;

/**
 * RPC 経由で音声ファイルの base64 データを取得し AudioBuffer にデコードする。
 */
async function fetchTrackBuffer(
  request: {
    getPlaybackData: (p: {
      filePath: string;
    }) => Promise<{ data: string; mimeType: string }>;
  },
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

/**
 * 録音の波形再生に必要な状態と操作をまとめて提供するフック。
 *
 * 背景: ExpandedPlayer（ライブラリでの再生）と PostRecordingPlayer（録音直後の
 * インライン再生）は、音声データの取得・AudioContext/PlaybackController の
 * ライフサイクル管理・波形計算・シーク処理を全く同じロジックで行う。
 * 両者の唯一の差分は周辺 UI（アクション行、Transcribe/Export 等）なので、
 * このフックを SSOT としてロジックを共有し、各コンポーネントは表示だけを担う。
 */
export function useTrackPlayback(recording: RecordingMetadata) {
  const { request } = useRpc();

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

  const barCount = Math.max(
    1,
    Math.floor(containerWidth / (BAR_WIDTH + BAR_GAP)),
  );
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

  // 音声データの読み込み（マウント時・recording 切り替え時に自動実行）
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

  const playPause = useCallback(() => {
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

  const seek = useCallback(
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

  const progress = duration > 0 ? currentTime / duration : 0;

  return {
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
    dispose: disposePlayback,
  };
}
