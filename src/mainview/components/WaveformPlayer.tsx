import { useCallback, useEffect, useRef, useState } from "react";
import { useRecordingStore } from "../stores/recordingStore.js";
import { useRpc } from "../hooks/useRpc.js";
import { useWaveformData } from "../hooks/useWaveformData.js";
import { WaveformTrack } from "./WaveformTrack.js";
import { PlaybackController } from "../audio/PlaybackController.js";
import type { TrackInfo } from "@shared/types.js";

const TRACK_HEIGHT = 48;
const BAR_WIDTH = 2;
const BAR_GAP = 1;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

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

function trackLabel(trackKind: string, channels: number): string {
  const kind = trackKind === "mic" ? "Mic" : "System";
  const ch = channels === 1 ? "Mono" : "Stereo";
  return `${kind} (${ch})`;
}

export function WaveformPlayer() {
  const { request } = useRpc();

  const playingRecordingId = useRecordingStore((s) => s.playingRecordingId);
  const setPlayingRecordingId = useRecordingStore((s) => s.setPlayingRecordingId);
  const recordings = useRecordingStore((s) => s.recordings);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [audioBuffers, setAudioBuffers] = useState<AudioBuffer[]>([]);
  const [tracks, setTracks] = useState<TrackInfo[]>([]);
  const [containerWidth, setContainerWidth] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const controllerRef = useRef<PlaybackController | null>(null);
  const rafRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const recording = recordings.find((r) => r.id === playingRecordingId);

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

  useEffect(() => {
    if (!recording) {
      disposePlayback();
      setAudioBuffers([]);
      setTracks([]);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    const loadAndPlay = async () => {
      disposePlayback();

      const ctx = new AudioContext();
      audioContextRef.current = ctx;

      const trackInfos = recording.tracks && recording.tracks.length > 0
        ? recording.tracks
        : [{
            trackKind: "mic" as const,
            fileName: recording.fileName,
            filePath: recording.filePath,
            channels: 2,
            fileSizeBytes: recording.fileSizeBytes,
          }];

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
        setPlayingRecordingId(null);
      };

      controller.play(0);
      setIsPlaying(true);
      startTimeUpdates();
    };

    loadAndPlay().catch((err) => {
      console.error("Failed to load audio:", err);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording?.id]);

  const handlePlayPause = useCallback(() => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;

    if (isPlaying) {
      ctrl.pause();
      stopTimeUpdates();
      setIsPlaying(false);
      setCurrentTime(ctrl.currentTime);
    } else {
      if (ctrl.currentTime >= ctrl.duration) {
        ctrl.play(0);
      } else {
        ctrl.play();
      }
      setIsPlaying(true);
      startTimeUpdates();
    }
  }, [isPlaying, startTimeUpdates, stopTimeUpdates]);

  const handleSeek = useCallback((progress: number) => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;

    const time = progress * ctrl.duration;
    ctrl.seek(time);
    setCurrentTime(time);

    if (isPlaying) {
      startTimeUpdates();
    }
  }, [isPlaying, startTimeUpdates]);

  useEffect(() => {
    return () => {
      disposePlayback();
    };
  }, [disposePlayback]);

  if (!recording) return null;

  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <div ref={containerRef} className="rounded-lg bg-gray-800 p-4">
      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <span className="text-xs text-gray-400">Loading...</span>
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

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={handlePlayPause}
          disabled={isLoading}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
        >
          {isLoading ? "..." : isPlaying ? "\u23F8" : "\u25B6"}
        </button>

        <span className="font-mono text-xs text-gray-400">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        <p className="min-w-0 flex-1 truncate text-right text-xs text-gray-500">
          {recording.fileName}
        </p>
      </div>
    </div>
  );
}
