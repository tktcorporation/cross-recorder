import { describe, it, expect, vi, beforeEach } from "vitest";
import { SystemAudioCapture } from "./SystemAudioCapture.js";

function createMockTrack(kind: "audio" | "video", label = "mock-track") {
  return {
    kind,
    label,
    enabled: true,
    stop: vi.fn(),
    applyConstraints: vi.fn().mockResolvedValue(undefined),
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

  it("calls getDisplayMedia with video: true and systemAudio: include", async () => {
    const audioTrack = createMockTrack("audio");
    const mockStream = createMockStream([audioTrack]);
    const getDisplayMedia = vi.fn().mockResolvedValue(mockStream);
    vi.stubGlobal("navigator", {
      mediaDevices: { getDisplayMedia },
    });

    await capture.start();

    expect(getDisplayMedia).toHaveBeenCalledOnce();
    expect(getDisplayMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        video: true,
        systemAudio: "include",
        audio: expect.anything(),
      }),
    );
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

  it("disables audio processing on captured tracks", async () => {
    const audioTrack = createMockTrack("audio");
    const mockStream = createMockStream([audioTrack]);
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getDisplayMedia: vi.fn().mockResolvedValue(mockStream),
      },
    });

    await capture.start();

    expect(audioTrack.applyConstraints).toHaveBeenCalledWith({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    });
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

  it("stop() is safe to call when no stream exists", () => {
    expect(() => capture.stop()).not.toThrow();
  });
});
