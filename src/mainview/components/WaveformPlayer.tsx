import { useCallback, useEffect, useRef, useState } from "react";
import { useRecordingStore } from "../stores/recordingStore.js";
import { useRpc } from "../hooks/useRpc.js";
import { useWaveformData } from "../hooks/useWaveformData.js";
import { WaveformTrack } from "./WaveformTrack.js";
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
  return audioContext.decodeAudioData(bytes.buffer);
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
  const sourceNodesRef = useRef<AudioBufferSourceNode[]>([]);
  const startTimeRef = useRef(0);
  const offsetRef = useRef(0);
  const rafRef = useRef(0);
  const isSeekingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const recording = recordings.find((r) => r.id === playingRecordingId);

  // Container width observation for bar count
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

  const stopSources = useCallback(() => {
    for (const node of sourceNodesRef.current) {
      try {
        node.stop();
        node.disconnect();
      } catch {
        // already stopped
      }
    }
    sourceNodesRef.current = [];
  }, []);

  const startPlayback = useCallback((offset: number) => {
    const ctx = audioContextRef.current;
    if (!ctx || audioBuffers.length === 0) return;

    isSeekingRef.current = true;
    stopSources();
    offsetRef.current = offset;

    const nodes: AudioBufferSourceNode[] = [];
    for (const buffer of audioBuffers) {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      nodes.push(source);
    }

    if (nodes[0]) {
      nodes[0].onended = () => {
        if (isSeekingRef.current) return;
        cancelAnimationFrame(rafRef.current);
        setIsPlaying(false);
        setCurrentTime(duration);
        setPlayingRecordingId(null);
      };
    }

    startTimeRef.current = ctx.currentTime;
    for (const node of nodes) {
      node.start(0, offset);
    }
    sourceNodesRef.current = nodes;
    isSeekingRef.current = false;
    setIsPlaying(true);

    cancelAnimationFrame(rafRef.current);
    const updateTime = () => {
      if (ctx.state === "running") {
        const elapsed = ctx.currentTime - startTimeRef.current + offset;
        setCurrentTime(Math.min(elapsed, duration));
      }
      rafRef.current = requestAnimationFrame(updateTime);
    };
    rafRef.current = requestAnimationFrame(updateTime);
  }, [stopSources, duration, setPlayingRecordingId, audioBuffers]);

  // Load audio buffers when recording changes
  useEffect(() => {
    if (!recording) {
      stopSources();
      cancelAnimationFrame(rafRef.current);
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
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
      const ctx = new AudioContext();
      audioContextRef.current = ctx;

      const trackInfos = recording.tracks && recording.tracks.length > 0
        ? recording.tracks
        : [{ trackKind: "mic" as const, fileName: recording.fileName, filePath: recording.filePath, channels: 2, fileSizeBytes: recording.fileSizeBytes }];

      const buffers = await Promise.all(
        trackInfos.map((track) => fetchTrackBuffer(request, track, ctx)),
      );

      if (cancelled) {
        ctx.close();
        return;
      }

      setTracks(trackInfos);
      setAudioBuffers(buffers);
      const maxDuration = Math.max(...buffers.map((b) => b.duration));
      setDuration(maxDuration);
      setIsLoading(false);

      // Auto-play
      offsetRef.current = 0;
      startTimeRef.current = ctx.currentTime;

      const nodes: AudioBufferSourceNode[] = [];
      for (const buffer of buffers) {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        nodes.push(source);
      }

      if (nodes[0]) {
        nodes[0].onended = () => {
          if (isSeekingRef.current) return;
          cancelAnimationFrame(rafRef.current);
          setIsPlaying(false);
          setCurrentTime(maxDuration);
          setPlayingRecordingId(null);
        };
      }

      for (const node of nodes) {
        node.start(0, 0);
      }
      sourceNodesRef.current = nodes;
      setIsPlaying(true);

      const updateTime = () => {
        if (ctx.state === "running") {
          const elapsed = ctx.currentTime - startTimeRef.current;
          setCurrentTime(Math.min(elapsed, maxDuration));
        }
        rafRef.current = requestAnimationFrame(updateTime);
      };
      rafRef.current = requestAnimationFrame(updateTime);
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
    const ctx = audioContextRef.current;
    if (!ctx) return;

    if (isPlaying) {
      const elapsed = ctx.currentTime - startTimeRef.current + offsetRef.current;
      ctx.suspend();
      cancelAnimationFrame(rafRef.current);
      setIsPlaying(false);
      setCurrentTime(elapsed);
      offsetRef.current = elapsed;
    } else {
      if (ctx.state === "suspended") {
        ctx.resume().then(() => {
          startTimeRef.current = ctx.currentTime;
          setIsPlaying(true);
          const updateTime = () => {
            if (ctx.state === "running") {
              const elapsed = ctx.currentTime - startTimeRef.current + offsetRef.current;
              setCurrentTime(Math.min(elapsed, duration));
            }
            rafRef.current = requestAnimationFrame(updateTime);
          };
          rafRef.current = requestAnimationFrame(updateTime);
        });
      } else {
        startPlayback(offsetRef.current);
      }
    }
  }, [isPlaying, duration, startPlayback]);

  const handleSeek = useCallback((progress: number) => {
    const time = progress * duration;
    setCurrentTime(time);

    if (isPlaying) {
      startPlayback(time);
    } else {
      offsetRef.current = time;
    }
  }, [isPlaying, duration, startPlayback]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      stopSources();
      audioContextRef.current?.close();
    };
  }, [stopSources]);

  if (!recording) return null;

  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <div ref={containerRef} className="rounded-lg bg-gray-800 p-4">
      {/* Waveform tracks */}
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

      {/* Controls */}
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
