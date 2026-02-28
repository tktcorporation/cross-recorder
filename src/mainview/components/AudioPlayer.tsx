import { useCallback, useEffect, useRef, useState } from "react";
import { useRecordingStore } from "../stores/recordingStore.js";
import { useRpc } from "../hooks/useRpc.js";
import type { TrackInfo } from "@shared/types.js";

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

export function AudioPlayer() {
  const { request } = useRpc();

  const playingRecordingId = useRecordingStore((s) => s.playingRecordingId);
  const setPlayingRecordingId = useRecordingStore(
    (s) => s.setPlayingRecordingId,
  );
  const recordings = useRecordingStore((s) => s.recordings);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodesRef = useRef<AudioBufferSourceNode[]>([]);
  const audioBuffersRef = useRef<AudioBuffer[]>([]);
  const startTimeRef = useRef(0);
  const offsetRef = useRef(0);
  const rafRef = useRef(0);

  const recording = recordings.find((r) => r.id === playingRecordingId);

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
    if (!ctx || audioBuffersRef.current.length === 0) return;

    stopSources();
    offsetRef.current = offset;

    const nodes: AudioBufferSourceNode[] = [];
    for (const buffer of audioBuffersRef.current) {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      nodes.push(source);
    }

    // Set up onended for the first source
    if (nodes[0]) {
      nodes[0].onended = () => {
        if (ctx.state !== "suspended") {
          cancelAnimationFrame(rafRef.current);
          setIsPlaying(false);
          setCurrentTime(duration);
          setPlayingRecordingId(null);
        }
      };
    }

    startTimeRef.current = ctx.currentTime;
    for (const node of nodes) {
      node.start(0, offset);
    }
    sourceNodesRef.current = nodes;
    setIsPlaying(true);

    const updateTime = () => {
      if (ctx.state === "running") {
        const elapsed = ctx.currentTime - startTimeRef.current + offset;
        setCurrentTime(Math.min(elapsed, duration));
      }
      rafRef.current = requestAnimationFrame(updateTime);
    };
    rafRef.current = requestAnimationFrame(updateTime);
  }, [stopSources, duration, setPlayingRecordingId]);

  // Load audio buffers when recording changes
  useEffect(() => {
    if (!recording) {
      stopSources();
      cancelAnimationFrame(rafRef.current);
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      audioBuffersRef.current = [];
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

      // Determine tracks to load
      const tracks = recording.tracks && recording.tracks.length > 0
        ? recording.tracks
        : [{ trackKind: "mic" as const, fileName: recording.fileName, filePath: recording.filePath, channels: 2, fileSizeBytes: recording.fileSizeBytes }];

      const buffers = await Promise.all(
        tracks.map((track) => fetchTrackBuffer(request, track, ctx)),
      );

      if (cancelled) {
        ctx.close();
        return;
      }

      audioBuffersRef.current = buffers;
      const maxDuration = Math.max(...buffers.map((b) => b.duration));
      setDuration(maxDuration);
      setIsLoading(false);

      // Auto-play
      startPlayback(0);
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
      // Pause
      const elapsed = ctx.currentTime - startTimeRef.current + offsetRef.current;
      ctx.suspend();
      cancelAnimationFrame(rafRef.current);
      setIsPlaying(false);
      setCurrentTime(elapsed);
      offsetRef.current = elapsed;
    } else {
      // Resume from where we paused
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

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    setCurrentTime(time);
    const ctx = audioContextRef.current;
    if (!ctx) return;

    // Restart playback from new position
    if (isPlaying) {
      startPlayback(time);
    } else {
      offsetRef.current = time;
    }
  }, [isPlaying, startPlayback]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      stopSources();
      audioContextRef.current?.close();
    };
  }, [stopSources]);

  if (!recording) return null;

  return (
    <div className="rounded-lg bg-gray-800 p-4">
      <div className="flex items-center gap-3">
        {/* Play/Pause */}
        <button
          type="button"
          onClick={handlePlayPause}
          disabled={isLoading}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
        >
          {isLoading ? "..." : isPlaying ? "\u23F8" : "\u25B6"}
        </button>

        {/* Progress bar */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="w-10 shrink-0 text-right font-mono text-xs text-gray-400">
            {formatTime(currentTime)}
          </span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-gray-600 accent-blue-500"
          />
          <span className="w-10 shrink-0 font-mono text-xs text-gray-400">
            {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* File name */}
      <p className="mt-2 truncate text-center text-xs text-gray-500">
        {recording.fileName}
      </p>
    </div>
  );
}
