import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecordingTrackLimit } from "@shared/types.js";

const fixtures = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  handlers: new Map<string, (notification: RecordingTrackLimit | { sessionId: string; status: "gap" | "receiving" } | { sessionId: string; reason: string } | { sessionId: string; level: number }) => void>(),
  sessionId: "s1",
  manager: {
    start: vi.fn(),
    stop: vi.fn(),
    stopTrack: vi.fn(),
    cancel: vi.fn(),
    getSessionId: vi.fn(),
    onTrackEnded: vi.fn(),
    onError: vi.fn(),
    getMicAnalyser: vi.fn().mockReturnValue(null),
    getSystemAnalyser: vi.fn().mockReturnValue(null),
    getElapsedMs: vi.fn().mockReturnValue(0),
    getTotalBytes: vi.fn().mockReturnValue(0),
  },
}));

// Exercise the real hook's event/ref lifecycle without a DOM or recording devices.
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useRef: (current: unknown) => ({ current }),
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void | (() => void)) => { fixtures.effects.push(effect); },
}));
vi.mock("../stores/recordingStore.js", async (original) => {
  const store = await original<typeof import("../stores/recordingStore.js")>();
  const useStore = (selector: (state: ReturnType<typeof store.useRecordingStore.getState>) => unknown) => selector(store.useRecordingStore.getState());
  return { ...store, useRecordingStore: Object.assign(useStore, store.useRecordingStore) };
});
vi.mock("./useRpc.js", () => ({
  useRpc: () => ({ request: { getPlatform: vi.fn().mockResolvedValue({ platform: "linux", nativeSystemAudioAvailable: true }) } }),
}));
vi.mock("./useWindowEvent.js", () => ({
  useWindowEvent: (name: string, handler: (notification: RecordingTrackLimit | { sessionId: string; status: "gap" | "receiving" } | { sessionId: string; reason: string } | { sessionId: string; level: number }) => void) => {
    fixtures.handlers.set(name, handler);
  },
}));
vi.mock("@audio/AudioCaptureManager.js", () => ({
  AudioCaptureManager: class {
    start = fixtures.manager.start;
    stop = fixtures.manager.stop;
    stopTrack = fixtures.manager.stopTrack;
    cancel = fixtures.manager.cancel;
    getSessionId = fixtures.manager.getSessionId;
    onTrackEnded = fixtures.manager.onTrackEnded;
    onError = fixtures.manager.onError;
    getMicAnalyser = fixtures.manager.getMicAnalyser;
    getSystemAnalyser = fixtures.manager.getSystemAnalyser;
    getElapsedMs = fixtures.manager.getElapsedMs;
    getTotalBytes = fixtures.manager.getTotalBytes;
  },
}));

import { useRecording } from "./useRecording.js";
import { useRecordingStore } from "../stores/recordingStore.js";

describe("useRecording track limit lifecycle", () => {
  const cleanups: Array<() => void> = [];

  function mount() {
    const actions = useRecording();
    for (const effect of fixtures.effects.splice(0)) {
      const cleanup = effect();
      if (cleanup) cleanups.push(cleanup);
    }
    return actions;
  }

  function unmount() {
    for (const cleanup of cleanups.splice(0)) cleanup();
  }

  function notify(sessionId: string, trackKind: "mic" | "system") {
    const receive = fixtures.handlers.get("recording-track-limit-reached");
    if (!receive) throw new Error("Track limit event handler was not registered");
    receive({ sessionId, trackKind, reason: "wav-size-limit" });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    fixtures.effects = [];
    fixtures.handlers.clear();
    fixtures.sessionId = "s1";
    useRecordingStore.getState().reset();
    fixtures.manager.getSessionId.mockImplementation(() => fixtures.sessionId);
    fixtures.manager.start.mockResolvedValue("s1");
    fixtures.manager.stop.mockResolvedValue({ id: "saved-s1", tracks: [] });
    fixtures.manager.cancel.mockResolvedValue(undefined);
  });

  afterEach(() => { unmount(); });

  it("applies only this manager's native notification received during acquisition", async () => {
    useRecordingStore.getState().setSystemAudioEnabled(true);
    let acquired!: (sessionId: string) => void;
    fixtures.manager.start.mockImplementationOnce(() => new Promise<string>((resolve) => { acquired = resolve; }));
    const actions = mount();
    actions.startRecording();
    await vi.waitFor(() => expect(fixtures.manager.start).toHaveBeenCalledOnce());
    notify("old", "mic");
    notify("s1", "system");
    notify("s1", "system");
    expect(useRecordingStore.getState().recordingLimitTracks).toEqual([]);
    acquired("s1");
    await vi.waitFor(() => expect(useRecordingStore.getState().sessionState.type).toBe("degraded"));
    expect(useRecordingStore.getState().sessionState).toMatchObject({ activeTracks: ["mic"] });
    expect(useRecordingStore.getState().recordingLimitTracks).toEqual(["system"]);
    expect(fixtures.manager.stop).not.toHaveBeenCalled();
    expect(fixtures.manager.stopTrack).toHaveBeenCalledExactlyOnceWith("system");
    expect(useRecordingStore.getState().nativeSystemLevel).toBe(0);
  });

  it("retains the warning after last-track finalization and clears it for a new START", async () => {
    const actions = mount();
    actions.startRecording();
    await vi.waitFor(() => expect(useRecordingStore.getState().sessionState.type).toBe("recording"));
    notify("s1", "mic");
    await vi.waitFor(() => expect(useRecordingStore.getState().sessionState.type).toBe("idle"));
    expect(useRecordingStore.getState().recordingLimitTracks).toEqual(["mic"]);
    expect(useRecordingStore.getState().recordings.map((recording) => recording.id)).toEqual(["saved-s1"]);
    actions.startRecording();
    expect(useRecordingStore.getState().recordingLimitTracks).toEqual([]);
    await vi.waitFor(() => expect(useRecordingStore.getState().sessionState.type).toBe("recording"));
  });

  it("上限トラックだけの波形を消し、重複通知と終了後の native レベルを無視する", async () => {
    const micAnalyser = {} as AnalyserNode;
    const systemAnalyser = {} as AnalyserNode;
    fixtures.manager.getMicAnalyser.mockReturnValueOnce(micAnalyser);
    fixtures.manager.getSystemAnalyser.mockReturnValueOnce(systemAnalyser);
    useRecordingStore.getState().setSystemAudioEnabled(true);
    const actions = mount();
    actions.startRecording();
    await vi.waitFor(() => expect(useRecordingStore.getState().sessionState.type).toBe("recording"));
    notify("s1", "mic");
    notify("s1", "mic");
    expect(fixtures.manager.stopTrack).toHaveBeenCalledExactlyOnceWith("mic");
    expect(useRecordingStore.getState().micAnalyser).toBeNull();
    expect(useRecordingStore.getState().systemAnalyser).toBe(systemAnalyser);
    useRecordingStore.getState().setNativeSystemLevel(0.7);
    notify("s1", "system");
    const receiveLevel = fixtures.handlers.get("native-system-audio-level");
    if (!receiveLevel) throw new Error("Level handler missing");
    receiveLevel({ sessionId: "s1", level: 0.9 });
    expect(useRecordingStore.getState().nativeSystemLevel).toBe(0);
    expect(useRecordingStore.getState().systemAnalyser).toBeNull();
  });

  it("ignores notifications while stopping and after a subsequent session starts", async () => {
    let finalized!: (metadata: { id: string; tracks: never[] }) => void;
    fixtures.manager.stop.mockImplementationOnce(() => new Promise((resolve) => { finalized = resolve; }));
    const actions = mount();
    actions.startRecording();
    await vi.waitFor(() => expect(useRecordingStore.getState().sessionState.type).toBe("recording"));
    actions.stopRecording();
    notify("s1", "mic");
    expect(useRecordingStore.getState().recordingLimitTracks).toEqual([]);
    finalized({ id: "saved-s1", tracks: [] });
    await vi.waitFor(() => expect(useRecordingStore.getState().sessionState.type).toBe("idle"));
    fixtures.sessionId = "s2";
    fixtures.manager.start.mockResolvedValueOnce("s2");
    actions.startRecording();
    await vi.waitFor(() => expect(useRecordingStore.getState().sessionState).toMatchObject({ type: "recording", sessionId: "s2" }));
    notify("s1", "mic");
    expect(useRecordingStore.getState().recordingLimitTracks).toEqual([]);
    expect(useRecordingStore.getState().sessionState.type).toBe("recording");
    expect(fixtures.manager.stopTrack).not.toHaveBeenCalled();
  });

  it("ignores notifications after cancel cleanup and on the next mounted session", async () => {
    const actions = mount();
    actions.startRecording();
    await vi.waitFor(() => expect(useRecordingStore.getState().sessionState.type).toBe("recording"));
    unmount();
    expect(fixtures.manager.cancel).toHaveBeenCalledOnce();
    notify("s1", "mic");
    expect(useRecordingStore.getState().recordingLimitTracks).toEqual([]);
    fixtures.sessionId = "s2";
    fixtures.manager.start.mockResolvedValueOnce("s2");
    const next = mount();
    next.startRecording();
    await vi.waitFor(() => expect(useRecordingStore.getState().sessionState).toMatchObject({ type: "recording", sessionId: "s2" }));
    notify("s1", "mic");
    expect(useRecordingStore.getState().recordingLimitTracks).toEqual([]);
    expect(useRecordingStore.getState().sessionState.type).toBe("recording");
  });
  function native(name: "native-system-audio-error" | "native-system-audio-receive-state", detail: { sessionId: string; reason: string } | { sessionId: string; status: "gap" | "receiving" }) {
    const handler = fixtures.handlers.get(name);
    if (!handler) throw new Error("Native event handler was not registered");
    handler(detail);
  }

  it("データ未受信は録音を継続し、ゼロ音声を含む受信再開で案内を消す", async () => {
    useRecordingStore.getState().setSystemAudioEnabled(true);
    const actions = mount();
    actions.startRecording();
    await vi.waitFor(() => expect(useRecordingStore.getState().sessionState.type).toBe("recording"));
    useRecordingStore.getState().setNativeSystemLevel(0.8);
    native("native-system-audio-receive-state", { sessionId: "s1", status: "gap" });
    expect(useRecordingStore.getState()).toMatchObject({ nativeSystemReceiveState: "gap", nativeSystemLevel: 0, sessionState: { type: "recording", activeTracks: ["mic", "system"] } });
    expect(fixtures.manager.stopTrack).not.toHaveBeenCalled();
    expect(fixtures.manager.stop).not.toHaveBeenCalled();
    native("native-system-audio-receive-state", { sessionId: "s1", status: "receiving" });
    expect(useRecordingStore.getState().nativeSystemReceiveState).toBe("receiving");
  });

  it("確定した native 障害だけを停止し、重複と非アクティブの通知を無視する", async () => {
    useRecordingStore.getState().setSystemAudioEnabled(true);
    const actions = mount();
    actions.startRecording();
    await vi.waitFor(() => expect(useRecordingStore.getState().sessionState.type).toBe("recording"));
    native("native-system-audio-receive-state", { sessionId: "s1", status: "gap" });
    native("native-system-audio-error", { sessionId: "s1", reason: "native EOF" });
    native("native-system-audio-error", { sessionId: "s1", reason: "duplicate EOF" });
    native("native-system-audio-receive-state", { sessionId: "s1", status: "gap" });
    expect(useRecordingStore.getState()).toMatchObject({ nativeSystemReceiveState: null, nativeSystemLevel: 0, sessionState: { type: "degraded", activeTracks: ["mic"], lostTracks: ["system"] } });
    expect(fixtures.manager.stopTrack).toHaveBeenCalledExactlyOnceWith("system");
    expect(fixtures.manager.stop).not.toHaveBeenCalled();
  });

  it("最後の native トラック障害でも保存し、停止中と次のセッションの古い通知を無視する", async () => {
    useRecordingStore.getState().setMicEnabled(false);
    useRecordingStore.getState().setSystemAudioEnabled(true);
    let finalized!: (metadata: { id: string; tracks: never[] }) => void;
    fixtures.manager.stop.mockImplementationOnce(() => new Promise((resolve) => { finalized = resolve; }));
    const actions = mount();
    actions.startRecording();
    await vi.waitFor(() => expect(useRecordingStore.getState().sessionState.type).toBe("recording"));
    native("native-system-audio-error", { sessionId: "s1", reason: "EOF" });
    native("native-system-audio-receive-state", { sessionId: "s1", status: "gap" });
    expect(useRecordingStore.getState().sessionState.type).toBe("stopping");
    expect(useRecordingStore.getState().nativeSystemReceiveState).toBeNull();
    finalized({ id: "saved-s1", tracks: [] });
    await vi.waitFor(() => expect(useRecordingStore.getState().sessionState.type).toBe("idle"));
    expect(useRecordingStore.getState().recordings.map((recording) => recording.id)).toEqual(["saved-s1"]);
    fixtures.sessionId = "s2";
    fixtures.manager.start.mockResolvedValueOnce("s2");
    actions.startRecording();
    await vi.waitFor(() => expect(useRecordingStore.getState().sessionState).toMatchObject({ type: "recording", sessionId: "s2" }));
    native("native-system-audio-error", { sessionId: "s1", reason: "queued EOF" });
    native("native-system-audio-receive-state", { sessionId: "s1", status: "gap" });
    expect(useRecordingStore.getState().sessionState.type).toBe("recording");
    expect(useRecordingStore.getState().nativeSystemReceiveState).toBeNull();
  });

  it.each([false, true])("取得中の自セッション通知を取得後に適用し、キャンセル時には破棄する (%s)", async (cancelled) => {
    useRecordingStore.getState().setSystemAudioEnabled(true);
    let acquired!: (sessionId: string) => void;
    fixtures.manager.start.mockImplementationOnce(() => new Promise<string>((resolve) => { acquired = resolve; }));
    const actions = mount();
    actions.startRecording();
    await vi.waitFor(() => expect(fixtures.manager.start).toHaveBeenCalledOnce());
    native("native-system-audio-error", { sessionId: "old", reason: "stale" });
    native("native-system-audio-receive-state", { sessionId: "s1", status: "gap" });
    native("native-system-audio-error", { sessionId: "s1", reason: "EOF" });
    expect(useRecordingStore.getState().nativeSystemReceiveState).toBeNull();
    if (cancelled) unmount();
    acquired("s1");
    await vi.waitFor(() => expect(useRecordingStore.getState().sessionState.type).toBe(cancelled ? "acquiring" : "degraded"));
    expect(fixtures.manager.stopTrack).toHaveBeenCalledTimes(cancelled ? 0 : 1);
    expect(useRecordingStore.getState().nativeSystemReceiveState).toBeNull();
  });

  it("古いレベルと gap 中の遅延レベルを無視し、受信再開後だけ表示する", async () => {
    useRecordingStore.getState().setSystemAudioEnabled(true);
    const actions = mount();
    actions.startRecording();
    await vi.waitFor(() => expect(useRecordingStore.getState().sessionState.type).toBe("recording"));
    const level = fixtures.handlers.get("native-system-audio-level");
    if (!level) throw new Error("Level handler missing");
    level({ sessionId: "old", level: 0.7 });
    expect(useRecordingStore.getState().nativeSystemLevel).toBe(0);
    native("native-system-audio-receive-state", { sessionId: "s1", status: "gap" });
    level({ sessionId: "s1", level: 0.7 });
    expect(useRecordingStore.getState().nativeSystemLevel).toBe(0);
    native("native-system-audio-receive-state", { sessionId: "s1", status: "receiving" });
    level({ sessionId: "s1", level: 0.7 });
    expect(useRecordingStore.getState().nativeSystemLevel).toBe(0.7);
    notify("s1", "system");
    native("native-system-audio-receive-state", { sessionId: "s1", status: "gap" });
    native("native-system-audio-error", { sessionId: "s1", reason: "late EOF" });
    expect(useRecordingStore.getState()).toMatchObject({ nativeSystemReceiveState: null, nativeSystemLevel: 0, sessionState: { type: "degraded", activeTracks: ["mic"] } });
    expect(fixtures.manager.stopTrack).toHaveBeenCalledExactlyOnceWith("system");
  });

  it("取得中の gap を取得後に表示して、停止開始で直ちに消す", async () => {
    useRecordingStore.getState().setSystemAudioEnabled(true);
    let acquired!: (sessionId: string) => void;
    fixtures.manager.start.mockImplementationOnce(() => new Promise<string>((resolve) => { acquired = resolve; }));
    const actions = mount();
    actions.startRecording();
    await vi.waitFor(() => expect(fixtures.manager.start).toHaveBeenCalledOnce());
    native("native-system-audio-receive-state", { sessionId: "s1", status: "gap" });
    expect(useRecordingStore.getState().nativeSystemReceiveState).toBeNull();
    acquired("s1");
    await vi.waitFor(() => expect(useRecordingStore.getState().nativeSystemReceiveState).toBe("gap"));
    actions.stopRecording();
    expect(useRecordingStore.getState().nativeSystemReceiveState).toBeNull();
  });

});
