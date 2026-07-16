import { describe, it, expect, vi, beforeEach } from "vitest";
import { MicrophoneCapture } from "./MicrophoneCapture.js";
import { createMockTrack, createMockStream } from "./testHelpers/mockMediaStream.js";

describe("MicrophoneCapture", () => {
  let capture: MicrophoneCapture;

  beforeEach(() => {
    capture = new MicrophoneCapture();
    vi.restoreAllMocks();
  });

  it("requests audio with the given deviceId as an exact constraint", async () => {
    const track = createMockTrack();
    const mockStream = createMockStream([track]);
    const getUserMedia = vi.fn().mockResolvedValue(mockStream);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

    await capture.start("device-123");

    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: expect.objectContaining({
          deviceId: { exact: "device-123" },
        }),
      }),
    );
  });

  it("attaches an ended listener to the audio track on start", async () => {
    const track = createMockTrack();
    const mockStream = createMockStream([track]);
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(mockStream) },
    });

    await capture.start();

    expect(track.addEventListener).toHaveBeenCalledWith(
      "ended",
      expect.any(Function),
    );
  });

  it("invokes the onTrackEnded callback when the track fires 'ended'", async () => {
    const track = createMockTrack();
    const mockStream = createMockStream([track]);
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(mockStream) },
    });

    const onEnded = vi.fn();
    capture.onTrackEnded(onEnded);
    await capture.start();

    // Simulate the browser firing the 'ended' event on the mic track
    // (e.g. the device was unplugged, or the OS revoked permission).
    const [, handler] = track.addEventListener.mock.calls[0]!;
    handler();

    expect(onEnded).toHaveBeenCalledOnce();
  });

  it("throws when no audio tracks are available", async () => {
    const mockStream = createMockStream([]);
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(mockStream) },
    });

    await expect(capture.start()).rejects.toThrow("No audio tracks available");
  });

  it("stop() removes the ended listener and stops all tracks", async () => {
    const track = createMockTrack();
    const mockStream = createMockStream([track]);
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(mockStream) },
    });

    await capture.start();
    capture.stop();

    expect(track.removeEventListener).toHaveBeenCalledWith(
      "ended",
      expect.any(Function),
    );
    expect(track.stop).toHaveBeenCalled();
  });

  it("nulls the callback on stop() so a stray late 'ended' event is a no-op", async () => {
    // This complements "stop() removes the ended listener" above: even if
    // something still holds and invokes the exact handler reference after
    // stop() (e.g. an event queued before removeEventListener took effect),
    // the callback must already be cleared so it can't fire.
    const track = createMockTrack();
    const mockStream = createMockStream([track]);
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(mockStream) },
    });

    const onEnded = vi.fn();
    capture.onTrackEnded(onEnded);
    await capture.start();
    const [, handler] = track.addEventListener.mock.calls[0]!;
    capture.stop();

    handler();

    expect(onEnded).not.toHaveBeenCalled();
  });

  it("stop() is safe to call when no stream exists", () => {
    expect(() => capture.stop()).not.toThrow();
  });
});
