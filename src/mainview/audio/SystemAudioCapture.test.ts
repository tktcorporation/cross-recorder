import { describe, it, expect, vi, beforeEach } from "vitest";
import { SystemAudioCapture } from "./SystemAudioCapture.js";

function createMockTrack(kind: "audio" | "video", label = "mock-track") {
  return {
    kind,
    label,
    enabled: true,
    stop: vi.fn(),
    applyConstraints: vi.fn().mockResolvedValue(undefined),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

function createMockStream(
  audioTracks: ReturnType<typeof createMockTrack>[] = [],
  videoTracks: ReturnType<typeof createMockTrack>[] = [],
) {
  const allTracks = [...audioTracks, ...videoTracks];
  return {
    getTracks: vi.fn(() => [...allTracks]),
    getAudioTracks: vi.fn(() => [...audioTracks]),
    getVideoTracks: vi.fn(() => [...videoTracks]),
    removeTrack: vi.fn(),
  };
}

describe("SystemAudioCapture", () => {
  let capture: SystemAudioCapture;

  beforeEach(() => {
    capture = new SystemAudioCapture();
    vi.restoreAllMocks();
  });

  it("tries video: false first, then falls back to video: true on error", async () => {
    const audioTrack = createMockTrack("audio");
    const mockStream = createMockStream([audioTrack]);
    const getDisplayMedia = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("not supported", "NotSupportedError"))
      .mockResolvedValueOnce(mockStream);
    vi.stubGlobal("navigator", {
      mediaDevices: { getDisplayMedia },
    });

    await capture.start();

    expect(getDisplayMedia).toHaveBeenCalledTimes(2);
    expect(getDisplayMedia).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ video: false, systemAudio: "include" }),
    );
    expect(getDisplayMedia).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ video: true, systemAudio: "include" }),
    );
  });

  it("succeeds with video: false when supported", async () => {
    const audioTrack = createMockTrack("audio");
    const mockStream = createMockStream([audioTrack]);
    const getDisplayMedia = vi.fn().mockResolvedValue(mockStream);
    vi.stubGlobal("navigator", {
      mediaDevices: { getDisplayMedia },
    });

    await capture.start();

    expect(getDisplayMedia).toHaveBeenCalledOnce();
    expect(getDisplayMedia).toHaveBeenCalledWith(
      expect.objectContaining({ video: false, systemAudio: "include" }),
    );
  });

  it("does not retry on NotAllowedError (user denied permission)", async () => {
    const getDisplayMedia = vi
      .fn()
      .mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    vi.stubGlobal("navigator", {
      mediaDevices: { getDisplayMedia },
    });

    await expect(capture.start()).rejects.toThrow("denied");
    expect(getDisplayMedia).toHaveBeenCalledOnce();
  });

  it("disables video tracks without stopping them to keep the display media session alive", async () => {
    const audioTrack = createMockTrack("audio");
    const videoTrack = createMockTrack("video");
    const mockStream = createMockStream([audioTrack], [videoTrack]);
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getDisplayMedia: vi.fn().mockResolvedValue(mockStream),
      },
    });

    await capture.start();

    expect(videoTrack.enabled).toBe(false);
    expect(videoTrack.stop).not.toHaveBeenCalled();
    expect(mockStream.removeTrack).not.toHaveBeenCalled();
  });

  it("throws when no audio tracks are available", async () => {
    const videoTrack = createMockTrack("video");
    const mockStream = createMockStream([], [videoTrack]);
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getDisplayMedia: vi.fn().mockResolvedValue(mockStream),
      },
    });

    await expect(capture.start()).rejects.toThrow(
      "No audio tracks available",
    );
  });

  it("cleans up stream when no audio tracks are available", async () => {
    const videoTrack = createMockTrack("video");
    const mockStream = createMockStream([], [videoTrack]);
    // After video tracks are removed, getVideoTracks returns empty
    // but getTracks still returns the video track for cleanup
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getDisplayMedia: vi.fn().mockResolvedValue(mockStream),
      },
    });

    await expect(capture.start()).rejects.toThrow();
    // stop() should have been called, which calls getTracks and stops all
    expect(mockStream.getTracks).toHaveBeenCalled();
  });

  it("passes audio processing constraints via getDisplayMedia (not applyConstraints)", async () => {
    const audioTrack = createMockTrack("audio");
    const mockStream = createMockStream([audioTrack]);
    const getDisplayMedia = vi.fn().mockResolvedValue(mockStream);
    vi.stubGlobal("navigator", {
      mediaDevices: { getDisplayMedia },
    });

    await capture.start();

    // Constraints should be passed upfront in getDisplayMedia call
    expect(getDisplayMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: expect.objectContaining({
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        }),
      }),
    );
    // applyConstraints should NOT be called — upfront is sufficient
    expect(audioTrack.applyConstraints).not.toHaveBeenCalled();
  });

  it("stop() stops all tracks and clears stream", async () => {
    const audioTrack = createMockTrack("audio");
    const mockStream = createMockStream([audioTrack]);
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getDisplayMedia: vi.fn().mockResolvedValue(mockStream),
      },
    });

    await capture.start();
    capture.stop();

    expect(audioTrack.stop).toHaveBeenCalled();
  });

  it("falls back to video: true when audio constraints cause fallback", async () => {
    const audioTrack = createMockTrack("audio");
    const mockStream = createMockStream([audioTrack]);
    const getDisplayMedia = vi.fn()
      .mockRejectedValueOnce(new DOMException("not supported", "NotSupportedError"))
      .mockResolvedValueOnce(mockStream);
    vi.stubGlobal("navigator", {
      mediaDevices: { getDisplayMedia },
    });

    const capture = new SystemAudioCapture();
    const stream = await capture.start();
    expect(stream).toBe(mockStream);
    // Both calls should pass audio constraints (not just `true`)
    expect(getDisplayMedia).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        audio: expect.objectContaining({ noiseSuppression: false }),
      }),
    );
    expect(getDisplayMedia).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        audio: expect.objectContaining({ noiseSuppression: false }),
      }),
    );
  });

  it("stop() is safe to call when no stream exists", () => {
    expect(() => capture.stop()).not.toThrow();
  });
});
