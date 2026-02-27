import { useCallback, useEffect, useRef, useState } from "react";
import { useRecordingStore } from "../stores/recordingStore.js";
import { useRpc } from "../hooks/useRpc.js";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function AudioPlayer() {
  const { request } = useRpc();
  const audioRef = useRef<HTMLAudioElement>(null);

  const playingRecordingId = useRecordingStore((s) => s.playingRecordingId);
  const setPlayingRecordingId = useRecordingStore(
    (s) => s.setPlayingRecordingId,
  );
  const recordings = useRecordingStore((s) => s.recordings);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const recording = recordings.find((r) => r.id === playingRecordingId);

  // Load audio URL when recording changes
  useEffect(() => {
    if (!recording) {
      setAudioUrl(null);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      return;
    }

    request
      .getPlaybackUrl({ filePath: recording.filePath })
      .then((res) => {
        setAudioUrl(res.url);
      })
      .catch((err) => {
        console.error("Failed to get playback URL:", err);
        setAudioUrl(null);
      });
  }, [recording, request]);

  // Auto-play when URL is loaded
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;

    audio.src = audioUrl;
    audio.play().catch(() => {
      // Autoplay blocked
    });
  }, [audioUrl]);

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      setCurrentTime(audio.currentTime);
    }
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      setDuration(audio.duration);
    }
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setPlayingRecordingId(null);
  }, [setPlayingRecordingId]);

  const handlePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const time = Number(e.target.value);
    audio.currentTime = time;
    setCurrentTime(time);
  };

  if (!recording) return null;

  return (
    <div className="rounded-lg bg-gray-800 p-4">
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={handleEnded}
      />

      <div className="flex items-center gap-3">
        {/* Play/Pause */}
        <button
          type="button"
          onClick={handlePlayPause}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white transition-colors hover:bg-blue-600"
        >
          {isPlaying ? "\u23F8" : "\u25B6"}
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
