import { beforeEach, describe, expect, it, vi } from "vitest";
import { Effect } from "effect";
import type { CrossRecorderRPC } from "../shared/rpc-schema.js";

const mocks = vi.hoisted(() => ({
  send: {
    recordingTrackLimitReached: vi.fn(),
    nativeSystemAudioLevel: vi.fn(),
    nativeSystemAudioError: vi.fn(),
    nativeSystemAudioReceiveState: vi.fn(),
  },
  startSession: vi.fn(),
  writeChunk: vi.fn(),
  writeChunkSync: vi.fn(),
  cancelSession: vi.fn(),
  startCapture: vi.fn(),
  stopCapture: vi.fn(),
}));

vi.mock("electrobun/bun", () => ({
  BrowserView: {
    defineRPC: (options: object) => ({ ...options, send: mocks.send }),
  },
}));
vi.mock("./services/FileService.js", () => ({
  startSession: mocks.startSession,
  writeChunk: mocks.writeChunk,
  writeChunkSync: mocks.writeChunkSync,
  cancelSession: mocks.cancelSession,
}));
vi.mock("./services/NativeSystemAudioCapture.js", () => ({
  NativeSystemAudioCapture: class {
    start = mocks.startCapture;
    stopIfActive = mocks.stopCapture;
  },
}));
vi.mock("./services/RecordingManager.js", () => ({}));
vi.mock("./services/TranscriptionService.js", () => ({}));
vi.mock("./services/UpdateService.js", () => ({}));

import { rpc } from "./rpc.js";

// The mock exposes the real handler functions registered with Electrobun.
type BunRequests = CrossRecorderRPC["bun"]["requests"];
type RequestHandlers = {
  [K in keyof BunRequests]: (params: BunRequests[K]["params"]) => Promise<BunRequests[K]["response"]>;
};
const requests = (rpc as unknown as { handlers: { requests: RequestHandlers } }).handlers.requests;

describe("RPC WAV track limit notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.send.recordingTrackLimitReached.mockReset();
    mocks.startSession.mockReturnValue(Effect.succeed({ success: true, filePath: "/tmp/fake-session" }));
    mocks.startCapture.mockResolvedValue(undefined);
    mocks.stopCapture.mockResolvedValue(undefined);
  });

  it("notifies the renderer for browser chunks with the affected session and track", async () => {
    mocks.writeChunk
      .mockReturnValueOnce(Effect.succeed({ success: true, chunkSizeBytes: 4, limitReached: true }))
      .mockReturnValueOnce(Effect.succeed({ success: true, chunkSizeBytes: 0, limitReached: false }));
    const params = { sessionId: "browser-session", trackKind: "mic" as const, chunkIndex: 0, pcmData: Buffer.alloc(8).toString("base64") };
    await expect(requests.saveRecordingChunk(params)).resolves.toMatchObject({ success: true, chunkSizeBytes: 4 });
    await requests.saveRecordingChunk({ ...params, chunkIndex: 1 });
    expect(mocks.send.recordingTrackLimitReached).toHaveBeenCalledExactlyOnceWith({ sessionId: "browser-session", trackKind: "mic", reason: "wav-size-limit" });
  });

  it.each([false, true])("native の上限で対象セッションを停止する（通知送信失敗: %s）", async (deliveryFails) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    if (deliveryFails) mocks.send.recordingTrackLimitReached.mockImplementation(() => { throw new Error("Renderer disconnected"); });
    mocks.writeChunkSync
      .mockReturnValueOnce({ success: true, chunkSizeBytes: 4, limitReached: true })
      .mockReturnValueOnce({ success: true, chunkSizeBytes: 0, limitReached: false });
    await requests.startRecordingSession({
      sessionId: "native-session",
      config: { sampleRate: 48000, channels: 2, bitDepth: 16, micEnabled: false, systemAudioEnabled: true, micDeviceId: null },
      tracks: [{ trackKind: "system", channels: 2 }],
      nativeSystemAudio: true,
    });
    const [captureCall] = mocks.startCapture.mock.calls;
    if (!captureCall) throw new Error("Native capture was not started");
    const writeChunk = captureCall[2] as (buffer: Buffer) => void;
    writeChunk(Buffer.alloc(8));
    writeChunk(Buffer.alloc(8));
    expect(mocks.writeChunkSync).toHaveBeenCalledWith("native-session", "system", Buffer.alloc(8));
    expect(mocks.send.recordingTrackLimitReached).toHaveBeenCalledExactlyOnceWith({ sessionId: "native-session", trackKind: "system", reason: "wav-size-limit" });
    expect(mocks.stopCapture).toHaveBeenCalledExactlyOnceWith("native-session");
    expect(error).toHaveBeenCalledTimes(deliveryFails ? 1 : 0);
    error.mockRestore();
  });

  it("keeps a completed write successful when the renderer transport fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.send.recordingTrackLimitReached.mockImplementation(() => { throw new Error("Renderer disconnected"); });
    mocks.writeChunk.mockReturnValue(Effect.succeed({ success: true, chunkSizeBytes: 4, limitReached: true }));
    await expect(requests.saveRecordingChunk({ sessionId: "s1", trackKind: "mic", chunkIndex: 0, pcmData: "AAAAAA==" })).resolves.toEqual({ success: true, chunkSizeBytes: 4 });
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });
  it("native 状態と障害の送信に開始セッションの識別子を維持する", async () => {
    await requests.startRecordingSession({
      sessionId: "native-session",
      config: { sampleRate: 48000, channels: 2, bitDepth: 16, micEnabled: false, systemAudioEnabled: true, micDeviceId: null },
      tracks: [{ trackKind: "system", channels: 2 }], nativeSystemAudio: true,
    });
    const call = mocks.startCapture.mock.calls[0];
    if (!call) throw new Error("Native capture was not started");
    const failure = call[4] as (reason: string) => void;
    const receipt = call[5] as (status: "gap" | "receiving") => void;
    failure("EOF");
    expect(mocks.send.nativeSystemAudioError).toHaveBeenCalledExactlyOnceWith({ sessionId: "native-session", reason: "EOF" });
    receipt("gap");
    receipt("receiving");
    expect(mocks.send.nativeSystemAudioReceiveState.mock.calls).toEqual([
      [{ sessionId: "native-session", status: "gap" }],
      [{ sessionId: "native-session", status: "receiving" }],
    ]);
  });

});
