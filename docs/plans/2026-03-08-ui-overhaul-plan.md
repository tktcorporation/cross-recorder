# UI大幅改善 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> **REQUIRED SUB-SKILL:** Use ui-craft skill for all UI implementation (reference-based approach via Context7).

**Goal:** 現在の4パネルレイアウトを、シングルビュー切替型（録音画面/ライブラリ画面）のアニメーションリッチなUIに刷新する

**Architecture:** shadcn/ui コンポーネント基盤 + Framer Motion アニメーション。画面は「録音」と「ライブラリ」の2ビューを AnimatePresence で切替。ロジック層（hooks, stores, RPC, audio/）は一切変更せず、コンポーネント層のみを再構築する。

**Tech Stack:** React 18, Tailwind CSS 3, shadcn/ui (Radix UI), Framer Motion, Zustand 5, Vite 6

**Design Doc:** `docs/plans/2026-03-08-ui-overhaul-design.md`

---

## Task 0: ブランチ作成

**Step 1: 作業ブランチを作成**

```bash
jj new main -m "feat: UI大幅改善"
jj bookmark create ui-overhaul
```

---

## Task 1: 依存パッケージの追加と shadcn/ui 基盤セットアップ

**Files:**
- Modify: `package.json`
- Modify: `tailwind.config.js`
- Modify: `tsconfig.json`
- Modify: `src/mainview/index.css`
- Create: `src/mainview/lib/utils.ts` (shadcn の cn ユーティリティ)

**Step 1: パッケージインストール**

```bash
pnpm add framer-motion class-variance-authority clsx tailwind-merge
pnpm add -D tailwindcss-animate
```

**Step 2: Tailwind 設定を更新**

`tailwind.config.js` を以下に置き換える:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/mainview/**/*.{html,tsx,ts}"],
  theme: {
    extend: {
      colors: {
        // shadcn/ui CSS変数ベースのカラーシステム
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // アプリ固有
        recording: {
          DEFAULT: "hsl(var(--recording))",
          foreground: "hsl(var(--recording-foreground))",
        },
        playback: {
          DEFAULT: "hsl(var(--playback))",
          foreground: "hsl(var(--playback-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      animation: {
        pulse: "pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
```

**Step 3: CSS変数を定義**

`src/mainview/index.css` を更新。ダークテーマの slate ベースカラーを CSS 変数で定義:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 222 47% 5%;      /* slate-950 相当 */
    --foreground: 210 40% 98%;     /* slate-50 */
    --card: 217 33% 10%;           /* slate-900 */
    --card-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222 47% 5%;
    --secondary: 217 33% 17%;     /* slate-800 */
    --secondary-foreground: 210 40% 98%;
    --muted: 217 33% 17%;
    --muted-foreground: 215 20% 55%;  /* slate-400 */
    --accent: 217 33% 17%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 84% 60%;     /* red-500 */
    --destructive-foreground: 210 40% 98%;
    --border: 217 33% 20%;        /* slate-700/50 */
    --input: 217 33% 20%;
    --ring: 212 92% 45%;          /* blue-500 */
    --radius: 0.75rem;

    /* アプリ固有 */
    --recording: 0 84% 60%;       /* red-500 */
    --recording-foreground: 210 40% 98%;
    --playback: 217 91% 60%;      /* blue-500 */
    --playback-foreground: 210 40% 98%;
  }

  body {
    @apply bg-background text-foreground antialiased;
    -webkit-app-region: drag;
  }

  button,
  select,
  input {
    -webkit-app-region: no-drag;
  }
}
```

**Step 4: cn ユーティリティを作成**

`src/mainview/lib/utils.ts`:

```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Tailwind CSSのクラス名を安全にマージするユーティリティ。
 * shadcn/uiのコンポーネントで条件付きクラス適用に使用。
 * clxで条件分岐し、twMergeで重複するTailwindクラスを解決する。
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**Step 5: tsconfig にパスエイリアスを追加**

`tsconfig.json` の paths に追加:

```json
"@/*": ["./src/mainview/*"]
```

`vite.config.ts` の alias にも追加:

```ts
"@": path.resolve(__dirname, "src/mainview"),
```

**Step 6: ビルド確認**

```bash
pnpm run build:vite
```

Expected: ビルド成功（既存コンポーネントには変更なし）

**Step 7: コミット**

```bash
jj commit -m "chore: shadcn/ui基盤セットアップ (Tailwind設定, CSS変数, cnユーティリティ, Framer Motion追加)"
```

---

## Task 2: shadcn/ui ベースコンポーネントの作成

**Files:**
- Create: `src/mainview/components/ui/button.tsx`
- Create: `src/mainview/components/ui/switch.tsx`
- Create: `src/mainview/components/ui/select.tsx`
- Create: `src/mainview/components/ui/card.tsx`
- Create: `src/mainview/components/ui/scroll-area.tsx`
- Create: `src/mainview/components/ui/badge.tsx`

**Step 1: Context7 で shadcn/ui のドキュメントを取得し、各コンポーネントのコードを取得**

ui-craft スキルの手順に従い、`resolve-library-id` → `query-docs` で Button, Switch, Select, Card, ScrollArea, Badge の実装コードを取得する。

**Step 2: 各コンポーネントを `src/mainview/components/ui/` に配置**

shadcn/ui のソースコードを取得し、プロジェクトのカラーシステム（CSS変数ベース）に合わせてカスタマイズして配置する。import パスは `@/lib/utils` を使用する。

注意: shadcn/ui のコンポーネントは Radix UI プリミティブをラップしているため、必要な Radix パッケージもインストールする:

```bash
pnpm add @radix-ui/react-switch @radix-ui/react-select @radix-ui/react-scroll-area
```

**Step 3: ビルド確認**

```bash
pnpm run build:vite
```

**Step 4: コミット**

```bash
jj commit -m "feat: shadcn/uiベースコンポーネント追加 (Button, Switch, Select, Card, ScrollArea, Badge)"
```

---

## Task 3: ビュー切替の基盤と新 App レイアウト

**Files:**
- Create: `src/mainview/stores/viewStore.ts`
- Modify: `src/mainview/App.tsx`

**Step 1: ビューストアの作成**

`src/mainview/stores/viewStore.ts`:

```ts
import { create } from "zustand";

/**
 * 画面遷移を管理するストア。
 * 録音画面とライブラリ画面の切替、および遷移方向（アニメーション用）を保持する。
 */
type View = "recording" | "library";

type ViewStore = {
  currentView: View;
  direction: 1 | -1;
  setView: (view: View) => void;
};

export const useViewStore = create<ViewStore>((set, get) => ({
  currentView: "recording",
  direction: 1,
  setView: (view) => {
    const current = get().currentView;
    if (current === view) return;
    set({
      currentView: view,
      direction: view === "library" ? 1 : -1,
    });
  },
}));
```

**Step 2: App.tsx を書き換え**

新しい `App.tsx` — AnimatePresence でビュー切替:

```tsx
import { AnimatePresence, motion } from "framer-motion";
import { useViewStore } from "./stores/viewStore.js";
import { RecordingView } from "./views/RecordingView.js";
import { LibraryView } from "./views/LibraryView.js";
import { UpdateNotification } from "./components/UpdateNotification.js";

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? "100%" : "-100%",
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? "-100%" : "100%",
    opacity: 0,
  }),
};

const slideTransition = {
  type: "spring" as const,
  stiffness: 300,
  damping: 30,
};

export default function App() {
  const currentView = useViewStore((s) => s.currentView);
  const direction = useViewStore((s) => s.direction);

  return (
    <div className="flex min-h-screen flex-col overflow-hidden bg-background">
      {/* Title bar */}
      <header className="flex h-10 shrink-0 items-center justify-between bg-card px-4">
        <h1 className="text-sm font-semibold tracking-tight text-foreground">
          Cross Recorder
        </h1>
        <UpdateNotification />
      </header>

      {/* View container */}
      <main className="relative flex-1 overflow-hidden">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentView}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={slideTransition}
            className="absolute inset-0"
          >
            {currentView === "recording" ? (
              <RecordingView />
            ) : (
              <LibraryView />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
```

この時点では RecordingView / LibraryView はプレースホルダー。

**Step 3: プレースホルダービューの作成**

`src/mainview/views/RecordingView.tsx`:

```tsx
import { useViewStore } from "../stores/viewStore.js";

export function RecordingView() {
  const setView = useViewStore((s) => s.setView);
  return (
    <div className="flex h-full flex-col items-center justify-center p-6">
      <p className="text-muted-foreground">Recording View (placeholder)</p>
      <button
        onClick={() => setView("library")}
        className="mt-4 text-sm text-playback underline"
      >
        Open Library
      </button>
    </div>
  );
}
```

`src/mainview/views/LibraryView.tsx`:

```tsx
import { useViewStore } from "../stores/viewStore.js";

export function LibraryView() {
  const setView = useViewStore((s) => s.setView);
  return (
    <div className="flex h-full flex-col items-center justify-center p-6">
      <p className="text-muted-foreground">Library View (placeholder)</p>
      <button
        onClick={() => setView("recording")}
        className="mt-4 text-sm text-playback underline"
      >
        Back to Recording
      </button>
    </div>
  );
}
```

**Step 4: ビルド確認**

```bash
pnpm run build:vite
```

**Step 5: コミット**

```bash
jj commit -m "feat: ビュー切替基盤 (viewStore, AnimatePresence, プレースホルダービュー)"
```

---

## Task 4: 録音画面の実装 — 録音ボタン + パルスリング

**Files:**
- Create: `src/mainview/components/recording/RecordButton.tsx`
- Create: `src/mainview/components/recording/PulseRings.tsx`
- Modify: `src/mainview/views/RecordingView.tsx`

**Step 1: PulseRings コンポーネント**

`src/mainview/components/recording/PulseRings.tsx` — 音声レベルに連動する同心円:

```tsx
import { motion } from "framer-motion";

type Props = {
  isRecording: boolean;
  micLevel: number;       // 0..1
  systemLevel: number;    // 0..1
};

/**
 * 録音ボタンを囲むパルスリング。
 * 音声レベルに応じてスケールと透明度が変化する同心円を描画する。
 * micLevel/systemLevel を別リングで表現し、どのソースから音が来ているか視覚化する。
 */
export function PulseRings({ isRecording, micLevel, systemLevel }: Props) {
  if (!isRecording) return null;

  const rings = [
    { level: micLevel, color: "hsl(var(--recording))", delay: 0 },
    { level: systemLevel, color: "hsl(var(--playback))", delay: 0.15 },
  ];

  return (
    <>
      {rings.map((ring, i) => (
        <motion.div
          key={i}
          className="absolute inset-0 rounded-full"
          style={{ border: `2px solid ${ring.color}` }}
          animate={{
            scale: 1 + ring.level * 0.4,
            opacity: 0.15 + ring.level * 0.35,
          }}
          transition={{
            type: "spring",
            stiffness: 200,
            damping: 15,
            delay: ring.delay,
          }}
        />
      ))}
    </>
  );
}
```

**Step 2: RecordButton コンポーネント**

`src/mainview/components/recording/RecordButton.tsx`:

```tsx
import { motion } from "framer-motion";
import { cn } from "@/lib/utils.js";

type Props = {
  recordingState: "idle" | "recording" | "stopping";
  canRecord: boolean;
  onClick: () => void;
};

/**
 * 中央に配置する大きな録音ボタン。
 * idle時は円形(●)、recording時は角丸四角(■)にモーフィングする。
 * Framer MotionのwhileHover/whileTapでマイクロインタラクションを実現。
 */
export function RecordButton({ recordingState, canRecord, onClick }: Props) {
  const isIdle = recordingState === "idle";
  const isRecording = recordingState === "recording";
  const isStopping = recordingState === "stopping";

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={isStopping || (!canRecord && isIdle)}
      whileHover={!isStopping ? { scale: 1.05 } : undefined}
      whileTap={!isStopping ? { scale: 0.95 } : undefined}
      className={cn(
        "relative flex h-20 w-20 items-center justify-center transition-colors",
        isIdle && "rounded-full bg-recording text-recording-foreground",
        isIdle && !canRecord && "cursor-not-allowed opacity-50",
        isRecording && "rounded-2xl bg-recording text-recording-foreground",
        isStopping && "cursor-not-allowed rounded-2xl bg-muted text-muted-foreground",
      )}
      layout
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
    >
      {isIdle && (
        <motion.span
          className="text-3xl leading-none"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
        >
          {"\u25CF"}
        </motion.span>
      )}
      {isRecording && (
        <motion.span
          className="text-2xl leading-none"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
        >
          {"\u25A0"}
        </motion.span>
      )}
      {isStopping && (
        <motion.svg
          className="h-8 w-8"
          viewBox="0 0 24 24"
          fill="none"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </motion.svg>
      )}
    </motion.button>
  );
}
```

**Step 3: RecordingView にボタンとリングを統合**

`src/mainview/views/RecordingView.tsx` を更新。既存の useRecording フック、useAudioLevel フック、recordingStore をそのまま使用する。SourcePanel の音声ソーストグルも配置する。

```tsx
import { motion } from "framer-motion";
import { useViewStore } from "../stores/viewStore.js";
import { useRecordingStore, selectRecordingState } from "../stores/recordingStore.js";
import { useRecording } from "../hooks/useRecording.js";
import { useAudioLevel } from "../hooks/useAudioLevel.js";
import { RecordButton } from "../components/recording/RecordButton.js";
import { PulseRings } from "../components/recording/PulseRings.js";
import { AudioSourceControls } from "../components/recording/AudioSourceControls.js";
import { RecordingWaveform } from "../components/recording/RecordingWaveform.js";

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, "0")).join(":");
}

export function RecordingView() {
  const setView = useViewStore((s) => s.setView);
  const { recordingState, startRecording, stopRecording } = useRecording();
  const elapsedMs = useRecordingStore((s) => s.elapsedMs);
  const micEnabled = useRecordingStore((s) => s.micEnabled);
  const systemAudioEnabled = useRecordingStore((s) => s.systemAudioEnabled);
  const micAnalyser = useRecordingStore((s) => s.micAnalyser);
  const systemAnalyser = useRecordingStore((s) => s.systemAnalyser);
  const nativeSystemLevel = useRecordingStore((s) => s.nativeSystemLevel);
  const recordings = useRecordingStore((s) => s.recordings);
  const recordingError = useRecordingStore((s) => s.recordingError);
  const setRecordingError = useRecordingStore((s) => s.setRecordingError);

  const micLevel = useAudioLevel(micAnalyser);
  const webSystemLevel = useAudioLevel(systemAnalyser);
  const systemLevel = systemAnalyser ? webSystemLevel : nativeSystemLevel;

  const canRecord = micEnabled || systemAudioEnabled;
  const isRecording = recordingState === "recording";

  const handleClick = () => {
    if (recordingState === "idle") startRecording();
    else if (recordingState === "recording") stopRecording();
  };

  return (
    <div className="flex h-full flex-col">
      {/* Navigation header */}
      <div className="flex items-center justify-end px-4 py-2">
        <button
          onClick={() => setView("library")}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Library ({recordings.length})
        </button>
      </div>

      {/* Center content */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
        {/* Record button with pulse rings */}
        <div className="relative flex items-center justify-center" style={{ width: 128, height: 128 }}>
          <PulseRings isRecording={isRecording} micLevel={micLevel} systemLevel={systemLevel} />
          <RecordButton recordingState={recordingState} canRecord={canRecord} onClick={handleClick} />
        </div>

        {/* Timer */}
        <div className="font-mono text-4xl tabular-nums tracking-tight text-foreground">
          {formatTime(elapsedMs)}
        </div>

        {/* Recording waveform (visible during/after recording) */}
        {isRecording && (
          <RecordingWaveform micLevel={micLevel} systemLevel={systemLevel} />
        )}

        {/* Error */}
        {recordingError && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            <span className="flex-1">{recordingError}</span>
            <button onClick={() => setRecordingError(null)} className="shrink-0 hover:opacity-70">
              {"\u2715"}
            </button>
          </motion.div>
        )}
      </div>

      {/* Bottom: audio source controls */}
      <div className="border-t border-border px-6 py-4">
        <AudioSourceControls disabled={recordingState !== "idle"} />
      </div>

      {/* Hint */}
      {!canRecord && recordingState === "idle" && (
        <p className="pb-4 text-center text-xs text-muted-foreground">
          Enable at least one audio source
        </p>
      )}
    </div>
  );
}
```

**Step 4: ビルド確認**

```bash
pnpm run build:vite
```

**Step 5: コミット**

```bash
jj commit -m "feat: 録音画面 - RecordButton, PulseRings, RecordingView レイアウト"
```

---

## Task 5: 録音画面 — AudioSourceControls と RecordingWaveform

**Files:**
- Create: `src/mainview/components/recording/AudioSourceControls.tsx`
- Create: `src/mainview/components/recording/RecordingWaveform.tsx`

**Step 1: AudioSourceControls**

`src/mainview/components/recording/AudioSourceControls.tsx` — 既存 SourcePanel のロジックを shadcn Switch を使って再構築:

```tsx
import { useRecordingStore } from "../../stores/recordingStore.js";
import { useAudioDevices } from "../../hooks/useAudioDevices.js";
// shadcn/ui Switch と Select を使用
// （Task 2 で作成した ui/ コンポーネント）

type Props = {
  disabled: boolean;
};

/**
 * マイク・システムオーディオのオン/オフ切替とデバイス選択。
 * 録音画面下部に配置する。録音中はdisabledになる。
 */
export function AudioSourceControls({ disabled }: Props) {
  const micEnabled = useRecordingStore((s) => s.micEnabled);
  const setMicEnabled = useRecordingStore((s) => s.setMicEnabled);
  const systemAudioEnabled = useRecordingStore((s) => s.systemAudioEnabled);
  const setSystemAudioEnabled = useRecordingStore((s) => s.setSystemAudioEnabled);
  const nativeSystemAudioAvailable = useRecordingStore((s) => s.nativeSystemAudioAvailable);
  const platform = useRecordingStore((s) => s.platform);

  const { devices, selectedMicId, setSelectedMicId } = useAudioDevices();

  return (
    <div className="space-y-3">
      {/* Microphone row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-foreground">Microphone</span>
          {micEnabled && (
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Mono
            </span>
          )}
        </div>
        {/* shadcn Switch を使用 */}
      </div>

      {/* Mic device selector (micEnabled時のみ表示) */}
      {micEnabled && (
        <select
          value={selectedMicId ?? ""}
          onChange={(e) => setSelectedMicId(e.target.value || null)}
          disabled={disabled}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          {devices.length === 0 && <option value="">No microphones found</option>}
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
          ))}
        </select>
      )}

      {/* System Audio row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-foreground">System Audio</span>
          {systemAudioEnabled && (
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Stereo
            </span>
          )}
        </div>
        {/* shadcn Switch を使用 */}
      </div>

      {systemAudioEnabled && (
        <p className="text-xs text-muted-foreground">
          {nativeSystemAudioAvailable
            ? "System audio will be captured directly via ScreenCaptureKit"
            : platform === "darwin"
              ? "Native capture binary not found. Rebuild with 'pnpm build:native' on macOS."
              : "Screen selection dialog will appear when recording starts"}
        </p>
      )}
    </div>
  );
}
```

実装時に shadcn Switch コンポーネントを適切に統合すること。

**Step 2: RecordingWaveform**

`src/mainview/components/recording/RecordingWaveform.tsx` — 録音中の横スクロール波形:

```tsx
import { useRef, useEffect, useCallback } from "react";

const BAR_WIDTH = 3;
const BAR_GAP = 2;
const MAX_BARS = 200;
const CANVAS_HEIGHT = 64;

type Props = {
  micLevel: number;
  systemLevel: number;
};

/**
 * 録音中にリアルタイムで右方向に伸びていく波形表示。
 * micLevel / systemLevel を定期的にサンプリングし、バーとして描画する。
 * Canvas を使用し、新しいバーが右端に追加されていく。
 */
export function RecordingWaveform({ micLevel, systemLevel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const barsRef = useRef<number[]>([]);
  const rafRef = useRef(0);

  // 合成レベル (mic + system の平均)
  const combinedLevel = Math.max(micLevel, systemLevel);

  useEffect(() => {
    const interval = setInterval(() => {
      const bars = barsRef.current;
      bars.push(combinedLevel);
      if (bars.length > MAX_BARS) bars.shift();
    }, 100);
    return () => clearInterval(interval);
  }, [combinedLevel]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const bars = barsRef.current;
    const centerY = h / 2;
    const maxBarH = h - 4;

    for (let i = 0; i < bars.length; i++) {
      const x = i * (BAR_WIDTH + BAR_GAP);
      const barH = Math.max(2, (bars[i] ?? 0) * maxBarH);
      ctx.fillStyle = "hsl(var(--recording))";
      ctx.beginPath();
      ctx.roundRect(x, centerY - barH / 2, BAR_WIDTH, barH, 1);
      ctx.fill();
    }

    rafRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  return (
    <div className="w-full max-w-md px-4">
      <canvas
        ref={canvasRef}
        className="w-full"
        style={{ height: CANVAS_HEIGHT }}
      />
    </div>
  );
}
```

**Step 3: ビルド確認**

```bash
pnpm run build:vite
```

**Step 4: コミット**

```bash
jj commit -m "feat: AudioSourceControls (shadcn Switch統合) + RecordingWaveform (横スクロール波形)"
```

---

## Task 6: ライブラリ画面の実装 — カードリスト + 展開再生

**Files:**
- Modify: `src/mainview/views/LibraryView.tsx`
- Create: `src/mainview/components/library/RecordingCard.tsx`
- Create: `src/mainview/components/library/ExpandedPlayer.tsx`

**Step 1: RecordingCard コンポーネント**

`src/mainview/components/library/RecordingCard.tsx` — 波形プレビュー付きカード。タップで展開し再生UIを表示:

```tsx
import { motion, AnimatePresence } from "framer-motion";
import type { RecordingMetadata } from "@shared/types.js";
import { ExpandedPlayer } from "./ExpandedPlayer.js";

type Props = {
  recording: RecordingMetadata;
  isExpanded: boolean;
  isPlaying: boolean;
  onToggleExpand: () => void;
  onPlay: () => void;
  onDelete: () => void;
  onOpenFolder: () => void;
};

/**
 * ライブラリ画面のカード。各録音を1枚のカードとして表示する。
 * タップで展開してフル波形+再生コントロールを表示。
 * Framer Motion の layout アニメーションで滑らかに高さが変化する。
 */
export function RecordingCard({
  recording, isExpanded, isPlaying,
  onToggleExpand, onPlay, onDelete, onOpenFolder,
}: Props) {
  // formatDate, formatDuration, formatFileSize, trackLabel は
  // 既存の RecordingItem.tsx から移植
  return (
    <motion.div
      layout
      className="overflow-hidden rounded-lg border border-border bg-card"
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      {/* ヘッダー: クリックで展開 */}
      <button
        onClick={onToggleExpand}
        className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-accent"
      >
        {/* ミニ波形プレビュー (固定高さ) */}
        <div className="h-8 w-16 shrink-0 rounded bg-secondary" />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-card-foreground">
            {recording.fileName}
          </p>
          <p className="text-xs text-muted-foreground">
            {/* date · duration · size */}
          </p>
        </div>

        {/* Tracks badges */}
        <div className="flex gap-1">
          {recording.tracks?.map((t) => (
            <span key={t.trackKind} className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {t.trackKind === "mic" ? "Mic" : "System"}
            </span>
          ))}
        </div>
      </button>

      {/* 展開部分 */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            <ExpandedPlayer
              recording={recording}
              isPlaying={isPlaying}
              onPlay={onPlay}
              onDelete={onDelete}
              onOpenFolder={onOpenFolder}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
```

**Step 2: ExpandedPlayer コンポーネント**

`src/mainview/components/library/ExpandedPlayer.tsx` — 既存の WaveformPlayer のロジックを統合。WaveformTrack は再利用する。

**Step 3: LibraryView を実装**

`src/mainview/views/LibraryView.tsx`:

```tsx
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useViewStore } from "../stores/viewStore.js";
import { useRecordingStore } from "../stores/recordingStore.js";
import { useRpc } from "../hooks/useRpc.js";
import { RecordingCard } from "../components/library/RecordingCard.js";

export function LibraryView() {
  const setView = useViewStore((s) => s.setView);
  const recordings = useRecordingStore((s) => s.recordings);
  const setRecordings = useRecordingStore((s) => s.setRecordings);
  const { request } = useRpc();

  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    request.getRecordings({}).then(setRecordings).catch(console.error);
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2">
        <button
          onClick={() => setView("recording")}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Back
        </button>
        <h2 className="text-sm font-semibold text-foreground">Library</h2>
        <span className="text-xs text-muted-foreground">{recordings.length}</span>
      </div>

      {/* Card list */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {recordings.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center">
            <p className="text-sm text-muted-foreground">No recordings yet</p>
            <button
              onClick={() => setView("recording")}
              className="mt-2 text-sm text-playback transition-colors hover:underline"
            >
              Start recording
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence>
              {recordings.map((r) => (
                <RecordingCard
                  key={r.id}
                  recording={r}
                  isExpanded={expandedId === r.id}
                  isPlaying={false}
                  onToggleExpand={() => setExpandedId(expandedId === r.id ? null : r.id)}
                  onPlay={() => {}}
                  onDelete={async () => {
                    await request.deleteRecording({ recordingId: r.id });
                    useRecordingStore.getState().removeRecording(r.id);
                  }}
                  onOpenFolder={() => request.openFileLocation({ filePath: r.filePath })}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 4: ビルド確認**

```bash
pnpm run build:vite
```

**Step 5: コミット**

```bash
jj commit -m "feat: ライブラリ画面 - RecordingCard (展開アニメーション), LibraryView"
```

---

## Task 7: ExpandedPlayer — カード内再生機能

**Files:**
- Create: `src/mainview/components/library/ExpandedPlayer.tsx`

**Step 1: ExpandedPlayer の実装**

既存の `WaveformPlayer.tsx` の再生ロジック（fetchTrackBuffer, PlaybackController, handlePlayPause, handleSeek）を再利用する形で実装。WaveformTrack コンポーネントもそのまま利用。

カード内に収まるコンパクトなレイアウト:
- フル波形（WaveformTrack）
- 再生/一時停止ボタン + 時間表示
- 削除・フォルダを開くアクション

**Step 2: ビルド確認**

```bash
pnpm run build:vite
```

**Step 3: コミット**

```bash
jj commit -m "feat: ExpandedPlayer - カード内再生 (WaveformTrack統合, PlaybackController再利用)"
```

---

## Task 8: 録音停止後の再生統合（録音→再生シームレス遷移）

**Files:**
- Modify: `src/mainview/views/RecordingView.tsx`
- Create: `src/mainview/components/recording/PostRecordingPlayer.tsx`

**Step 1: PostRecordingPlayer**

録音停止後にその場で再生確認できるコンポーネント。録音中の波形がそのまま再生用に切り替わる。

- 録音完了時に `addRecording` で追加されたメタデータから再生データを取得
- WaveformTrack で再生波形を表示
- 再生/一時停止ボタン
- 「ライブラリで見る」ボタン

**Step 2: RecordingView に統合**

録音完了後（lastRecording が存在し、かつ idle 状態）に PostRecordingPlayer を表示。新しい録音開始でクリア。

**Step 3: ビルド確認 + コミット**

```bash
pnpm run build:vite
jj commit -m "feat: 録音停止後のシームレス再生 (PostRecordingPlayer)"
```

---

## Task 9: UpdateNotification の刷新

**Files:**
- Modify: `src/mainview/components/UpdateNotification.tsx`

**Step 1: 既存ロジックを維持しつつ、スタイルを新カラーシステムに更新**

- `bg-gray-*` → `bg-card`, `bg-secondary`, `text-foreground` 等に置き換え
- Framer Motion で状態切替時のフェードアニメーション追加
- `AnimatePresence` で各状態の切替をスムーズに

**Step 2: ビルド確認 + コミット**

```bash
pnpm run build:vite
jj commit -m "refactor: UpdateNotification を新カラーシステムに移行 + フェードアニメーション"
```

---

## Task 10: 旧コンポーネントの削除とクリーンアップ

**Files:**
- Delete: `src/mainview/components/SourcePanel.tsx` (AudioSourceControls に置き換え済み)
- Delete: `src/mainview/components/RecordPanel.tsx` (RecordButton + RecordingView に置き換え済み)
- Delete: `src/mainview/components/RecordingsList.tsx` (LibraryView に置き換え済み)
- Delete: `src/mainview/components/RecordingItem.tsx` (RecordingCard に置き換え済み)
- Delete: `src/mainview/components/WaveformPlayer.tsx` (ExpandedPlayer に置き換え済み)
- Keep: `src/mainview/components/WaveformTrack.tsx` (再利用)
- Keep: `src/mainview/components/LevelMeter.tsx` (必要に応じて残す)
- Keep: `src/mainview/components/UpdateNotification.tsx` (更新済み)

**Step 1: 不要ファイルを削除**

各ファイルが他のどこからも import されていないことを確認してから削除。

**Step 2: ビルド確認 + テスト**

```bash
pnpm run build:vite
pnpm test
pnpm run typecheck
```

**Step 3: コミット**

```bash
jj commit -m "refactor: 旧UIコンポーネントを削除 (新ビュー構造に完全移行)"
```

---

## Task 11: ui-craft 仕上げチェック

**Step 1: ui-craft スキルのフェーズ3「AI感を排除する」チェックリストを実行**

以下を確認・修正:
- タイポグラフィ: font-weight の使い分け（300/400/500/600）、letter-spacing 調整
- カラー: pure black/white を避けているか（CSS変数で対応済みのはず）
- スペーシング: 8px グリッドに沿っているか
- border-radius の階層: カード(12px) > ボタン(8px) > バッジ(4px or full)
- shadow の使い分け
- hover で translateY(-1px) + subtle shadow
- transition duration をサイズに合わせる

**Step 2: ui-craft フェーズ4 最終チェックリスト**

- [ ] 一貫性: border-radius, shadow, spacing が統一
- [ ] 呼吸: 十分な余白
- [ ] 階層: 録音ボタンが最も目立つ
- [ ] テキスト: placeholder、ラベルが自然
- [ ] 状態: hover, focus, active, disabled, loading, empty, error
- [ ] 色のコントラスト: WCAG AA 準拠

**Step 3: 修正 + コミット**

```bash
pnpm run build:vite
jj commit -m "style: ui-craft仕上げ - タイポグラフィ, スペーシング, アニメーション調整"
```

---

## Task 12: Changeset 作成と最終確認

**Step 1: Changeset ファイル作成**

`.changeset/ui-overhaul.md`:

```markdown
---
"cross-recorder": minor
---

UIを大幅改善: シングルビュー切替型レイアウト、shadcn/ui導入、Framer Motionアニメーション、パルスリング付き録音ボタン、カード型ライブラリ
```

**Step 2: 全体ビルド + テスト**

```bash
pnpm run build:vite
pnpm test
pnpm run typecheck
pnpm run lint
```

**Step 3: コミット**

```bash
jj commit -m "chore: changeset追加 (UI大幅改善 minor)"
```
