import { describe, it, expect } from "vitest";
import {
  formatClock,
  formatPlaybackTime,
  formatDurationMs,
  formatFileSize,
  formatRecordedAt,
} from "./format.js";

describe("formatClock", () => {
  it("formats valid milliseconds as HH:MM:SS", () => {
    expect(formatClock(3661000)).toBe("01:01:01");
    expect(formatClock(0)).toBe("00:00:00");
  });

  it("falls back on NaN", () => {
    expect(formatClock(Number.NaN)).toBe("—:—:—");
  });

  it("falls back on negative values", () => {
    expect(formatClock(-1000)).toBe("—:—:—");
  });

  it("falls back on Infinity", () => {
    expect(formatClock(Number.POSITIVE_INFINITY)).toBe("—:—:—");
  });
});

describe("formatPlaybackTime", () => {
  it("formats valid seconds as M:SS", () => {
    expect(formatPlaybackTime(65)).toBe("1:05");
    expect(formatPlaybackTime(0)).toBe("0:00");
  });

  it("falls back on NaN", () => {
    expect(formatPlaybackTime(Number.NaN)).toBe("—:—");
  });

  it("falls back on negative values", () => {
    expect(formatPlaybackTime(-5)).toBe("—:—");
  });

  it("falls back on Infinity", () => {
    expect(formatPlaybackTime(Number.POSITIVE_INFINITY)).toBe("—:—");
  });
});

describe("formatDurationMs", () => {
  it("formats valid milliseconds as M:SS", () => {
    expect(formatDurationMs(65000)).toBe("1:05");
  });

  it("falls back on NaN", () => {
    expect(formatDurationMs(Number.NaN)).toBe("—:—");
  });

  it("falls back on negative values", () => {
    expect(formatDurationMs(-1)).toBe("—:—");
  });

  it("falls back on Infinity", () => {
    expect(formatDurationMs(Number.POSITIVE_INFINITY)).toBe("—:—");
  });
});

describe("formatFileSize", () => {
  it("formats bytes under 1MB as KB", () => {
    expect(formatFileSize(2048)).toBe("2.0 KB");
  });

  it("formats bytes at or over 1MB as MB", () => {
    expect(formatFileSize(1024 * 1024 * 2.5)).toBe("2.5 MB");
  });

  it("falls back on NaN", () => {
    expect(formatFileSize(Number.NaN)).toBe("—");
  });

  it("falls back on negative values", () => {
    expect(formatFileSize(-1)).toBe("—");
  });

  it("falls back on Infinity", () => {
    expect(formatFileSize(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

describe("formatRecordedAt", () => {
  it("formats a valid ISO string as YYYY/MM/DD HH:MM", () => {
    expect(formatRecordedAt("2024-01-15T09:30:00")).toBe("2024/01/15 09:30");
  });

  it("falls back on an invalid date string", () => {
    expect(formatRecordedAt("not-a-date")).toBe("—");
  });

  it("falls back on an empty string", () => {
    expect(formatRecordedAt("")).toBe("—");
  });
});
