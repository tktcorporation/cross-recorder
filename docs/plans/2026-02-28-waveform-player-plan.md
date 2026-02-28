# Waveform Player Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** AudioPlayer を波形表示付きプレイヤーに置き換え、シークバグを修正する

**Architecture:** Canvas 2D API で棒グラフ波形を描画。AudioBuffer から RMS ダウンサンプリングで波形データを生成。再生済み/未再生を色分け。波形クリックでシーク。複数トラックは上下に並べて表示。

**Tech Stack:** React 18, Canvas 2D API, Web Audio API, Zustand, Tailwind CSS, Vitest

---

### Task 1: 波形データ生成ユーティリティ

**Files:**
- Create: `src/mainview/audio/waveformData.ts`
- Test: `src/mainview/audio/waveformData.test.ts`

**Step 1: Write the failing test**

```typescript
// src/mainview/audio/waveformData.test.ts
import { describe, it, expect } from "vitest";
import { computeWaveformBars } from "./waveformData.js";

describe("computeWaveformBars", () => {
  it("downsamples PCM channel data to bar heights", () => {
    // 100 samples, 10 bars → 10 samples per bar
    const channelData = new Float32Array(100);
    // Fill first 10 samples with 0.5 (first bar)
    for (let i = 0; i < 10; i++) channelData[i] = 0.5;
    // Rest stays 0

    const bars = computeWaveformBars(channelData, 10);

    expect(bars).toHaveLength(10);
    expect(bars[0]).toBeGreaterThan(0);
    expect(bars[1]).toBe(0); // silence
  });

  it("returns values normalized between 0 and 1", () => {
    const channelData = new Float32Array(100);
    for (let i = 0; i < 100; i++) channelData[i] = (i % 2 === 0) ? 1.0 : -1.0;

    const bars = computeWaveformBars(channelData, 10);

    for (const bar of bars) {
      expect(bar).toBeGreaterThanOrEqual(0);
      expect(bar).toBeLessThanOrEqual(1);
    }
  });

  it("handles empty channel data", () => {
    const bars = computeWaveformBars(new Float32Array(0), 10);
    expect(bars).toHaveLength(10);
    expect(bars.every((b) => b === 0)).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/mainview/audio/waveformData.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// src/mainview/audio/waveformData.ts

/**
 * AudioBuffer のチャンネルデータから、指定本数の棒グラフ高さ配列を生成する。
 * 各棒の値はそのセグメントの RMS (0〜1)。
 */
export function computeWaveformBars(
  channelData: Float32Array,
  barCount: number,
): number[] {
  const bars: number[] = new Array(barCount).fill(0);
  if (channelData.length === 0 || barCount <= 0) return bars;

  const samplesPerBar = channelData.length / barCount;

  for (let i = 0; i < barCount; i++) {
    const start = Math.floor(i * samplesPerBar);
    const end = Math.floor((i + 1) * samplesPerBar);
    let sumSquares = 0;
    for (let j = start; j < end; j++) {
      sumSquares += channelData[j]! * channelData[j]!;
    }
    const rms = Math.sqrt(sumSquares / (end - start));
    bars[i] = Math.min(1, rms);
  }

  return bars;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/mainview/audio/waveformData.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
jj commit -m "feat: add waveform data computation utility with tests"
```

---

### Task 2: useWaveformData hook

**Files:**
- Create: `src/mainview/hooks/useWaveformData.ts`

**Step 1: Write the hook**

この hook は AudioBuffer 配列を受け取り、各トラックの波形棒データ配列を返す。Canvas 幅に応じた barCount で再計算する。ステレオの場合は L/R チャンネルの平均 RMS。

```typescript
// src/mainview/hooks/useWaveformData.ts
import { useMemo } from "react";
import { computeWaveformBars } from "../audio/waveformData.js";

export type TrackWaveform = {
  bars: number[];
  channels: number;
};

/**
 * AudioBuffer 配列から各トラックの波形棒データを生成する。
 * barCount は Canvas 幅に基づいて呼び出し元が計算する。
 */
export function useWaveformData(
  audioBuffers: AudioBuffer[],
  barCount: number,
): TrackWaveform[] {
  return useMemo(() => {
    if (barCount <= 0) return [];

    return audioBuffers.map((buffer) => {
      const channels = buffer.numberOfChannels;
      const leftChannel = buffer.getChannelData(0);

      if (channels === 1) {
        return { bars: computeWaveformBars(leftChannel, barCount), channels };
      }

      // Stereo: average L/R RMS per bar
      const rightChannel = buffer.getChannelData(1);
      const leftBars = computeWaveformBars(leftChannel, barCount);
      const rightBars = computeWaveformBars(rightChannel, barCount);
      const avgBars = leftBars.map((l, i) => (l + rightBars[i]!) / 2);

      return { bars: avgBars, channels };
    });
  }, [audioBuffers, barCount]);
}
```

**Step 2: Commit**

```bash
jj commit -m "feat: add useWaveformData hook for buffer-to-bars conversion"
```

---

### Task 3: WaveformTrack コンポーネント（Canvas 描画）

**Files:**
- Create: `src/mainview/components/WaveformTrack.tsx`

**Step 1: Write the component**

Canvas に棒グラフを描画し、再生済み/未再生の色分けとクリックシークを処理する。

```tsx
// src/mainview/components/WaveformTrack.tsx
import { useCallback, useEffect, useRef } from "react";

const BAR_WIDTH = 2;
const BAR_GAP = 1;
const MIN_BAR_HEIGHT = 2;
const PLAYED_COLOR = "#3b82f6"; // blue-500
const UNPLAYED_COLOR = "#6b7280"; // gray-500

type Props = {
  label: string;
  bars: number[];
  progress: number; // 0〜1
  height: number;
  onSeek: (progress: number) => void;
};

export function WaveformTrack({ label, bars, progress, height, onSeek }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;

    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, displayWidth, displayHeight);

    const centerY = displayHeight / 2;
    const maxBarHeight = displayHeight - 4; // padding
    const progressX = progress * displayWidth;

    for (let i = 0; i < bars.length; i++) {
      const x = i * (BAR_WIDTH + BAR_GAP);
      if (x > displayWidth) break;

      const barHeight = Math.max(MIN_BAR_HEIGHT, bars[i]! * maxBarHeight);
      const halfBar = barHeight / 2;

      ctx.fillStyle = x < progressX ? PLAYED_COLOR : UNPLAYED_COLOR;
      ctx.beginPath();
      ctx.roundRect(x, centerY - halfBar, BAR_WIDTH, barHeight, 1);
      ctx.fill();
    }
  }, [bars, progress]);

  useEffect(() => {
    draw();
  }, [draw]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const newProgress = Math.max(0, Math.min(1, clickX / rect.width));
      onSeek(newProgress);
    },
    [onSeek],
  );

  return (
    <div ref={containerRef} className="flex flex-col">
      <span className="mb-1 text-[10px] font-medium text-gray-400">
        {label}
      </span>
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        className="w-full cursor-pointer"
        style={{ height }}
      />
    </div>
  );
}
```

**Step 2: Commit**

```bash
jj commit -m "feat: add WaveformTrack canvas component with bar drawing and click seek"
```

---

### Task 4: WaveformPlayer コンポーネント（AudioPlayer 置き換え）

**Files:**
- Create: `src/mainview/components/WaveformPlayer.tsx`
- Modify: `src/mainview/App.tsx:4,29` (import 変更 + JSX 差し替え)

**Step 1: Write the WaveformPlayer**

AudioPlayer.tsx の再生ロジックをベースに、波形UI + シークバグ修正を統合。

```tsx
// src/mainview/components/WaveformPlayer.tsx
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
```

**Step 2: Update App.tsx to use WaveformPlayer**

In `src/mainview/App.tsx`:
- Change import from `AudioPlayer` to `WaveformPlayer`
- Change JSX from `<AudioPlayer />` to `<WaveformPlayer />`

```diff
-import { AudioPlayer } from "./components/AudioPlayer.js";
+import { WaveformPlayer } from "./components/WaveformPlayer.js";
```

```diff
-        <AudioPlayer />
+        <WaveformPlayer />
```

**Step 3: Verify build compiles**

Run: `pnpm tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
jj commit -m "feat: replace AudioPlayer with WaveformPlayer - canvas waveform, click seek, seek bug fix"
```

---

### Task 5: 旧 AudioPlayer 削除 + 最終確認

**Files:**
- Delete: `src/mainview/components/AudioPlayer.tsx`

**Step 1: Delete old AudioPlayer**

`AudioPlayer.tsx` はもう `WaveformPlayer` に完全に置き換えられたので削除する。

**Step 2: Verify no references remain**

Run: `grep -r "AudioPlayer" src/ --include="*.ts" --include="*.tsx"`
Expected: No results

**Step 3: Run full test suite**

Run: `pnpm vitest run`
Expected: All tests pass

**Step 4: Commit**

```bash
jj commit -m "refactor: remove old AudioPlayer component"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | 波形データ生成ユーティリティ + テスト | `waveformData.ts`, `waveformData.test.ts` |
| 2 | useWaveformData hook | `useWaveformData.ts` |
| 3 | WaveformTrack Canvas コンポーネント | `WaveformTrack.tsx` |
| 4 | WaveformPlayer + App.tsx 差し替え | `WaveformPlayer.tsx`, `App.tsx` |
| 5 | 旧 AudioPlayer 削除 | `AudioPlayer.tsx` を削除 |

シークバグ修正ポイント: Task 4 の `WaveformPlayer` 内で `isSeekingRef` フラグを導入し、`onended` コールバックでシーク起因の停止を無視。
