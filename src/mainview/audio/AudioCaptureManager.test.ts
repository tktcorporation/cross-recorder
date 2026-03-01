import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("nanoid", () => ({
  nanoid: () => "test-session-id",
}));

const { mockPipeline, mockMicCapture, mockSystemCapture } = vi.hoisted(
  () => ({
    mockPipeline: {
      initialize: vi.fn().mockResolvedValue(undefined),
      addTrack: vi.fn(),
      stop: vi.fn(),
      getAnalyserForTrack: vi.fn().mockReturnValue(null),
    },
    mockMicCapture: {
      start: vi.fn().mockResolvedValue({ getTracks: () => [] }),
      stop: vi.fn(),
    },
    mockSystemCapture: {
      start: vi.fn().mockResolvedValue({ getTracks: () => [] }),
      stop: vi.fn(),
      onTrackEnded: vi.fn(),
    },
  }),
);

vi.mock("./RecordingPipeline.js", () => {
  return {
    RecordingPipeline: class {
      initialize = mockPipeline.initialize;
      addTrack = mockPipeline.addTrack;
      stop = mockPipeline.stop;
      getAnalyserForTrack = mockPipeline.getAnalyserForTrack;
    },
  };
});

vi.mock("./MicrophoneCapture.js", () => {
  return {
    MicrophoneCapture: class {
      start = mockMicCapture.start;
      stop = mockMicCapture.stop;
    },
  };
});

vi.mock("./SystemAudioCapture.js", () => {
  return {
    SystemAudioCapture: class {
      start = mockSystemCapture.start;
      stop = mockSystemCapture.stop;
      onTrackEnded = mockSystemCapture.onTrackEnded;
    },
  };
});

vi.stubGlobal("performance", { now: vi.fn(() => 1000) });

import { AudioCaptureManager } from "./AudioCaptureManager.js";

function createMockRpc() {
  return {
    startRecordingSession: vi
      .fn()
      .mockResolvedValue({ success: true, filePath: "/tmp/test" }),
    saveRecordingChunk: vi
      .fn()
      .mockResolvedValue({ success: true, bytesWritten: 0 }),
    finalizeRecording: vi.fn().mockResolvedValue({
      id: "test-session-id",
      fileName: "test",
      filePath: "/tmp/test",
      tracks: [],
      createdAt: new Date().toISOString(),
      durationMs: 0,
      fileSizeBytes: 0,
      config: {
        sampleRate: 48000,
        channels: 2,
        bitDepth: 16,
        micEnabled: true,
        systemAudioEnabled: false,
        micDeviceId: null,
      },
    }),
    cancelRecording: vi.fn().mockResolvedValue({ success: true }),
  };
}

describe("AudioCaptureManager", () => {
  let rpc: ReturnType<typeof createMockRpc>;

  beforeEach(() => {
    rpc = createMockRpc();
    mockMicCapture.start.mockResolvedValue({ getTracks: () => [] });
    mockMicCapture.stop.mockClear();
    mockSystemCapture.start.mockResolvedValue({ getTracks: () => [] });
    mockSystemCapture.stop.mockClear();
    mockPipeline.initialize.mockResolvedValue(undefined);
    mockPipeline.addTrack.mockClear();
    mockPipeline.stop.mockClear();
    mockPipeline.getAnalyserForTrack.mockReturnValue(null);
  });

  it("cleans up and cancels session when system audio capture fails", async () => {
    mockSystemCapture.start.mockRejectedValue(
      new DOMException("Permission denied", "NotAllowedError"),
    );

    const manager = new AudioCaptureManager(rpc);

    await expect(
      manager.start({
        micEnabled: true,
        systemAudioEnabled: true,
      }),
    ).rejects.toThrow();

    expect(rpc.cancelRecording).toHaveBeenCalledWith({
      sessionId: "test-session-id",
    });
    expect(mockMicCapture.stop).toHaveBeenCalled();
    expect(mockSystemCapture.stop).toHaveBeenCalled();
    expect(mockPipeline.stop).toHaveBeenCalled();
    expect(manager.getSessionId()).toBeNull();
  });

  it("cleans up and cancels session when mic capture fails", async () => {
    mockMicCapture.start.mockRejectedValue(
      new DOMException("Permission denied", "NotAllowedError"),
    );

    const manager = new AudioCaptureManager(rpc);

    await expect(
      manager.start({
        micEnabled: true,
        systemAudioEnabled: false,
      }),
    ).rejects.toThrow();

    expect(rpc.cancelRecording).toHaveBeenCalledWith({
      sessionId: "test-session-id",
    });
    expect(mockPipeline.stop).toHaveBeenCalled();
    expect(manager.getSessionId()).toBeNull();
  });

  it("starts successfully with mic only", async () => {
    const manager = new AudioCaptureManager(rpc);

    const sessionId = await manager.start({
      micEnabled: true,
      systemAudioEnabled: false,
    });

    expect(sessionId).toBe("test-session-id");
    expect(rpc.startRecordingSession).toHaveBeenCalledOnce();
    expect(rpc.cancelRecording).not.toHaveBeenCalled();
  });

  it("starts successfully with system audio only", async () => {
    const manager = new AudioCaptureManager(rpc);

    const sessionId = await manager.start({
      micEnabled: false,
      systemAudioEnabled: true,
    });

    expect(sessionId).toBe("test-session-id");
    expect(rpc.cancelRecording).not.toHaveBeenCalled();
  });

  it("starts successfully with both mic and system audio", async () => {
    const manager = new AudioCaptureManager(rpc);

    const sessionId = await manager.start({
      micEnabled: true,
      systemAudioEnabled: true,
    });

    expect(sessionId).toBe("test-session-id");
    expect(rpc.startRecordingSession).toHaveBeenCalledWith(
      expect.objectContaining({
        tracks: [
          { trackKind: "mic", channels: 1 },
          { trackKind: "system", channels: 2 },
        ],
      }),
    );
  });

  it("stop() finalizes the recording and resets state", async () => {
    const manager = new AudioCaptureManager(rpc);

    await manager.start({
      micEnabled: true,
      systemAudioEnabled: false,
    });

    const metadata = await manager.stop();

    expect(rpc.finalizeRecording).toHaveBeenCalledOnce();
    expect(metadata).toBeDefined();
    expect(manager.getSessionId()).toBeNull();
  });

  it("stop() throws when no active session", async () => {
    const manager = new AudioCaptureManager(rpc);
    await expect(manager.stop()).rejects.toThrow("No active recording session");
  });

  it("cancel() is safe to call when no active session", async () => {
    const manager = new AudioCaptureManager(rpc);
    await expect(manager.cancel()).resolves.not.toThrow();
    expect(rpc.cancelRecording).not.toHaveBeenCalled();
  });

  it("cancel() stops recording and cleans up", async () => {
    const manager = new AudioCaptureManager(rpc);

    await manager.start({
      micEnabled: true,
      systemAudioEnabled: true,
    });

    await manager.cancel();

    expect(rpc.cancelRecording).toHaveBeenCalledWith({
      sessionId: "test-session-id",
    });
    expect(mockPipeline.stop).toHaveBeenCalled();
    expect(mockMicCapture.stop).toHaveBeenCalled();
    expect(mockSystemCapture.stop).toHaveBeenCalled();
    expect(manager.getSessionId()).toBeNull();
  });
});
