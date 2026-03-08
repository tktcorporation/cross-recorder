import { useCallback, useEffect, useRef } from "react";

/**
 * 録音中に表示される横スクロール波形ビジュアライザ。
 * iOS Voice Memosの録音画面を参考に、右側に新しいバーが追加され左へスクロールする。
 *
 * 100msごとにmicLevel+systemLevelの合成値をサンプリングし、バー配列に追加。
 * requestAnimationFrameでCanvas描画を行い、devicePixelRatioに対応した
 * クリスプなレンダリングを実現する。
 *
 * 最大200本のバーを保持し、それ以上は古いものから破棄する。
 */
type RecordingWaveformProps = {
  micLevel: number;
  systemLevel: number;
  isRecording: boolean;
};

/** バーの描画パラメータ */
const BAR_WIDTH = 3;
const BAR_GAP = 2;
const MAX_BARS = 200;
const SAMPLE_INTERVAL_MS = 100;
const CANVAS_HEIGHT = 64;

/** recording CSS変数から取得した色のフォールバック値 */
const FALLBACK_BAR_COLOR = "hsl(0, 84%, 60%)";

export function RecordingWaveform({
  micLevel,
  systemLevel,
  isRecording,
}: RecordingWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const barsRef = useRef<number[]>([]);
  const rafRef = useRef<number>(0);
  const sampleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** 最新のレベル値をref経由で参照（タイマーコールバック用） */
  const levelsRef = useRef({ mic: 0, system: 0 });
  const barColorRef = useRef<string>(FALLBACK_BAR_COLOR);

  levelsRef.current = { mic: micLevel, system: systemLevel };

  /** CSS変数から録音色を取得 */
  const resolveBarColor = useCallback(() => {
    const root = document.documentElement;
    const hsl = getComputedStyle(root).getPropertyValue("--recording").trim();
    if (hsl) {
      barColorRef.current = `hsl(${hsl})`;
    }
  }, []);

  /** Canvas描画ループ */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const displayWidth = canvas.clientWidth;
    const displayHeight = CANVAS_HEIGHT;

    // Canvas解像度をdevicePixelRatioに合わせる
    if (
      canvas.width !== displayWidth * dpr ||
      canvas.height !== displayHeight * dpr
    ) {
      canvas.width = displayWidth * dpr;
      canvas.height = displayHeight * dpr;
      ctx.scale(dpr, dpr);
    }

    ctx.clearRect(0, 0, displayWidth, displayHeight);

    const bars = barsRef.current;
    const totalBarWidth = BAR_WIDTH + BAR_GAP;
    const visibleBars = Math.min(
      bars.length,
      Math.floor(displayWidth / totalBarWidth),
    );

    // 右端から描画、新しいバーが右側
    const startIndex = bars.length - visibleBars;

    ctx.fillStyle = barColorRef.current;

    for (let i = 0; i < visibleBars; i++) {
      const level = bars[startIndex + i]!;
      // 最小バー高さ 2px、最大はキャンバス高さの90%
      const barHeight = Math.max(2, level * displayHeight * 0.9);
      const x = displayWidth - (visibleBars - i) * totalBarWidth;
      const y = (displayHeight - barHeight) / 2;

      ctx.beginPath();
      // 小さな角丸
      const radius = Math.min(1.5, barHeight / 2);
      ctx.roundRect(x, y, BAR_WIDTH, barHeight, radius);
      ctx.fill();
    }

    rafRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    if (!isRecording) {
      barsRef.current = [];
      // 最後のフレームをクリア
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
      return;
    }

    resolveBarColor();

    // サンプリングタイマー: 100msごとにレベルをバー配列に追加
    sampleTimerRef.current = setInterval(() => {
      const { mic, system } = levelsRef.current;
      // 両ソースの合成値（最大値ベース）
      const combined = Math.max(mic, system);
      barsRef.current.push(combined);
      if (barsRef.current.length > MAX_BARS) {
        barsRef.current.shift();
      }
    }, SAMPLE_INTERVAL_MS);

    // 描画ループ開始
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (sampleTimerRef.current) {
        clearInterval(sampleTimerRef.current);
        sampleTimerRef.current = null;
      }
      cancelAnimationFrame(rafRef.current);
    };
  }, [isRecording, draw, resolveBarColor]);

  if (!isRecording) return null;

  return (
    <canvas
      ref={canvasRef}
      className="w-full"
      style={{ height: CANVAS_HEIGHT }}
      aria-label="Recording waveform"
    />
  );
}
