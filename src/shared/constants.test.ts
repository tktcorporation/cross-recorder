import { describe, it, expect } from "vitest";
import {
  DEFAULT_SAMPLE_RATE,
  DEFAULT_BIT_DEPTH,
  DEFAULT_CHANNELS,
  WAV_HEADER_SIZE,
  WORKLET_BUFFER_SIZE,
  CHUNK_INTERVAL_MS,
} from "./constants.js";

describe("constants", () => {
  it("DEFAULT_SAMPLE_RATE is a standard audio sample rate", () => {
    expect([44100, 48000, 96000]).toContain(DEFAULT_SAMPLE_RATE);
  });

  it("DEFAULT_BIT_DEPTH is a valid PCM bit depth", () => {
    expect([8, 16, 24, 32]).toContain(DEFAULT_BIT_DEPTH);
  });

  it("DEFAULT_CHANNELS is 1 or 2", () => {
    expect([1, 2]).toContain(DEFAULT_CHANNELS);
  });

  it("WAV_HEADER_SIZE is exactly 44 bytes", () => {
    expect(WAV_HEADER_SIZE).toBe(44);
  });

  it("WORKLET_BUFFER_SIZE is a power of 2", () => {
    expect(WORKLET_BUFFER_SIZE).toBeGreaterThan(0);
    expect(WORKLET_BUFFER_SIZE & (WORKLET_BUFFER_SIZE - 1)).toBe(0);
  });

  it("CHUNK_INTERVAL_MS is positive", () => {
    expect(CHUNK_INTERVAL_MS).toBeGreaterThan(0);
  });
});

describe("version consistency", () => {
  it("package.json and electrobun.config.ts versions match", async () => {
    const pkg = await import("../../package.json");
    const electrobunConfig = await import("../../electrobun.config.js");
    expect(electrobunConfig.default.app.version).toBe(pkg.version);
  });
});
