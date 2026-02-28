import { describe, it, expect } from "vitest";
import { computeWaveformBars } from "./waveformData.js";

describe("computeWaveformBars", () => {
  it("downsamples PCM channel data to bar heights", () => {
    const channelData = new Float32Array(100);
    for (let i = 0; i < 10; i++) channelData[i] = 0.5;

    const bars = computeWaveformBars(channelData, 10);

    expect(bars).toHaveLength(10);
    expect(bars[0]).toBeGreaterThan(0);
    expect(bars[1]).toBe(0);
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
