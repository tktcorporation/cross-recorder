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
