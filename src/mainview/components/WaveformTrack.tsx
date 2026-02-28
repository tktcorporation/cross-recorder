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
    const maxBarHeight = displayHeight - 4;
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
