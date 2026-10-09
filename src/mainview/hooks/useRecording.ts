import { useCallback, useEffect, useRef } from "react";
import {
  useRecordingStore,
  selectRecordingState,
} from "../stores/recordingStore.js";
import { useRpc } from "./useRpc.js";
import { useWindowEvent } from "./useWindowEvent.js";
import { RecordingSession } from "@audio/RecordingSession.js";
import type { AudioCaptureManager } from "@audio/AudioCaptureManager.js";
import type { SessionState } from "@audio/types.js";
import type { RecordingTrackLimit, TrackKind } from "@shared/types.js";

type NativeNotification =
  | { type: "error"; sessionId: string; reason: string }
  | { type: "receive"; sessionId: string; status: "gap" | "receiving" };

export function useRecording() {
  const { request } = useRpc();
  const sessionRef = useRef<RecordingSession | null>(null);
  const managerRef = useRef<AudioCaptureManager | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingNativeRef = useRef<NativeNotification[]>([]);
  const pendingTrackLimitsRef = useRef<RecordingTrackLimit[]>([]);

  const sessionState = useRecordingStore((s) => s.sessionState);
  const setSessionState = useRecordingStore((s) => s.setSessionState);
  const selectedMicId = useRecordingStore((s) => s.selectedMicId);
  const micEnabled = useRecordingStore((s) => s.micEnabled);
  const systemAudioEnabled = useRecordingStore((s) => s.systemAudioEnabled);
  const updateStatus = useRecordingStore((s) => s.updateStatus);
  const setCurrentSessionId = useRecordingStore((s) => s.setCurrentSessionId);
  const addRecording = useRecordingStore((s) => s.addRecording);
  const setMicAnalyser = useRecordingStore((s) => s.setMicAnalyser);
  const setSystemAnalyser = useRecordingStore((s) => s.setSystemAnalyser);
  const setRecordingError = useRecordingStore((s) => s.setRecordingError);
  const addRecordingLimitTrack = useRecordingStore((s) => s.addRecordingLimitTrack);
  const clearRecordingLimits = useRecordingStore((s) => s.clearRecordingLimits);
  const nativeSystemAudioAvailable = useRecordingStore(
    (s) => s.nativeSystemAudioAvailable,
  );
  const setNativeSystemAudioAvailable = useRecordingStore(
    (s) => s.setNativeSystemAudioAvailable,
  );
  const setNativeSystemLevel = useRecordingStore(
    (s) => s.setNativeSystemLevel,
  );
  const setNativeSystemReceiveState = useRecordingStore((s) => s.setNativeSystemReceiveState);
  const setPlatform = useRecordingStore((s) => s.setPlatform);

  // --- Platform detection (run once on mount) ---

  useEffect(() => {
    request.getPlatform({}).then((result) => {
      setNativeSystemAudioAvailable(result.nativeSystemAudioAvailable);
      setPlatform(result.platform);
    }).catch(() => {
      // Ignore — default to false (use getDisplayMedia fallback)
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Helper functions (stable via refs) ---

  function stopStatusTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function startStatusTimer() {
    stopStatusTimer();
    timerRef.current = setInterval(() => {
      if (managerRef.current) {
        updateStatus(
          managerRef.current.getElapsedMs(),
          managerRef.current.getTotalBytes(),
        );
      }
    }, 100);
  }

  function cleanupResources() {
    stopStatusTimer();
    managerRef.current = null;
    pendingTrackLimitsRef.current = [];
    pendingNativeRef.current = [];
    setNativeSystemReceiveState(null);
    setCurrentSessionId(null);
    setMicAnalyser(null);
    setSystemAnalyser(null);
    setNativeSystemLevel(0);
    updateStatus(0, 0);
  }

  function handleNativeNotification(notification: NativeNotification) {
    const session = sessionRef.current;
    const manager = managerRef.current;
    if (!session || !manager || manager.getSessionId() !== notification.sessionId) return;
    const state = session.getState();
    if (state.type === "acquiring") {
      if (state.requestedTracks.includes("system")) pendingNativeRef.current.push(notification);
      return;
    }
    if (
      (state.type !== "recording" && state.type !== "degraded") ||
      state.sessionId !== notification.sessionId ||
      !state.activeTracks.includes("system")
    ) return;
    if (notification.type === "receive") {
      setNativeSystemReceiveState(notification.status);
      if (notification.status === "gap") setNativeSystemLevel(0);
      return;
    }
    console.warn("Native system audio error:", notification.reason);
    setNativeSystemReceiveState(null);
    setNativeSystemLevel(0);
    setSystemAnalyser(null);
    manager.stopTrack("system");
    session.dispatch({ type: "TRACK_LOST", track: "system" });
  }

  async function handleAcquiring(requestedTracks: TrackKind[]) {
    try {
      const { AudioCaptureManager: ACM } = await import(
        "@audio/AudioCaptureManager.js"
      );

      const manager = new ACM({
        checkSystemAudioPermission: (p) =>
          request.checkSystemAudioPermission(p),
        startRecordingSession: (p) => request.startRecordingSession(p),
        saveRecordingChunk: (p) => request.saveRecordingChunk(p),
        finalizeRecording: (p) => request.finalizeRecording(p),
        cancelRecording: (p) => request.cancelRecording(p),
      });
      managerRef.current = manager;

      // Set up track-ended and error callbacks
      manager.onTrackEnded((trackKind: TrackKind) => {
        if (managerRef.current !== manager) return;
        console.warn(`Track ended: ${trackKind}`);
        sessionRef.current?.dispatch({ type: "TRACK_LOST", track: trackKind });
      });
      manager.onError((reason: string) => {
        if (managerRef.current !== manager) return;
        sessionRef.current?.dispatch({ type: "ERROR", reason });
      });

      const useNative =
        nativeSystemAudioAvailable && requestedTracks.includes("system");

      const sessionId = await manager.start({
        micEnabled: requestedTracks.includes("mic"),
        systemAudioEnabled: requestedTracks.includes("system"),
        micDeviceId: selectedMicId ?? undefined,
        nativeSystemAudio: useNative,
      });
      if (managerRef.current !== manager) return;

      // Expose AnalyserNodes (system analyser is null when using native capture)
      setMicAnalyser(manager.getMicAnalyser());
      setSystemAnalyser(manager.getSystemAnalyser());

      // Notify state machine that acquisition succeeded
      sessionRef.current?.dispatch({
        type: "ACQUIRED",
        sessionId,
        tracks: requestedTracks,
      });
      // Native capture starts before browser device acquisition finishes.
      // Keep only this manager's early notification, then apply the usual
      // session/active-track guards once ACQUIRED has established identity.
      const pending = pendingTrackLimitsRef.current;
      pendingTrackLimitsRef.current = [];
      for (const notification of pending) {
        sessionRef.current?.dispatch({ type: "TRACK_LIMIT_REACHED", ...notification });
      }
      const nativePending = pendingNativeRef.current;
      pendingNativeRef.current = [];
      for (const notification of nativePending) handleNativeNotification(notification);
    } catch (err) {
      console.error("Failed to acquire devices:", err);
      const reason = err instanceof Error ? err.message : "Unknown error";
      sessionRef.current?.dispatch({ type: "ERROR", reason });
    }
  }

  async function handleStopping(_sessionId: string) {
    stopStatusTimer();
    try {
      if (managerRef.current) {
        const metadata = await managerRef.current.stop();
        addRecording(metadata);
      }
      sessionRef.current?.dispatch({ type: "FINALIZED" });
    } catch (err) {
      console.error("Failed to finalize recording:", err);
      const reason = err instanceof Error ? err.message : "Finalize failed";
      sessionRef.current?.dispatch({ type: "ERROR", reason });
    }
  }

  // Handle side effects for state transitions
  function handleStateTransition(state: SessionState) {
    setSessionState(state);

    switch (state.type) {
      case "acquiring":
        clearRecordingLimits();
        pendingTrackLimitsRef.current = [];
        pendingNativeRef.current = [];
        setNativeSystemReceiveState(null);
        handleAcquiring(state.requestedTracks);
        break;
      case "recording":
        setCurrentSessionId(state.sessionId);
        startStatusTimer();
        break;
      case "stopping":
        setNativeSystemReceiveState(null);
        setNativeSystemLevel(0);
        handleStopping(state.sessionId);
        break;
      case "error":
        setRecordingError(state.message);
        cleanupResources();
        break;
      case "idle":
        // If we were recording/stopping, this means we completed
        cleanupResources();
        break;
    }
  }

  // Keep the handler in a ref so the session effect doesn't re-run
  // when dependencies change (which would cancel any active recording).
  const handleStateTransitionRef = useRef(handleStateTransition);
  handleStateTransitionRef.current = handleStateTransition;

  // Initialize RecordingSession — only once on mount
  useEffect(() => {
    const session = new RecordingSession();
    sessionRef.current = session;

    const unsub = session.on("stateChange", (state) => {
      handleStateTransitionRef.current(state);
    });
    const unsubLimits = session.on("trackLimitReached", (notification) => {
      managerRef.current?.stopTrack(notification.trackKind);
      if (notification.trackKind === "mic") setMicAnalyser(null);
      else {
        setSystemAnalyser(null);
        setNativeSystemReceiveState(null);
        setNativeSystemLevel(0);
      }
      addRecordingLimitTrack(notification.trackKind);
    });

    return () => {
      unsub();
      unsubLimits();
      sessionRef.current = null;
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      const manager = managerRef.current;
      managerRef.current = null;
      pendingTrackLimitsRef.current = [];
      pendingNativeRef.current = [];
      setNativeSystemReceiveState(null);
      setNativeSystemLevel(0);
      manager?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for status updates from bun process
  useWindowEvent("recording-status", (detail) => {
    updateStatus(detail.elapsedMs, detail.fileSizeBytes);
  }, [updateStatus]);

  // Listen for native system audio level updates from bun process
  useWindowEvent("native-system-audio-level", (detail) => {
    const state = sessionRef.current?.getState();
    if (
      (state?.type === "recording" || state?.type === "degraded") &&
      state.activeTracks.includes("system") &&
      state.sessionId === detail.sessionId &&
      useRecordingStore.getState().nativeSystemReceiveState !== "gap"
    ) {
      setNativeSystemLevel(detail.level);
    }
  }, [setNativeSystemLevel]);

  // Listen for native system audio errors (subprocess crash etc.)
  useWindowEvent("native-system-audio-error", (detail) => {
    handleNativeNotification({ type: "error", ...detail });
  }, []);

  useWindowEvent("native-system-audio-receive-state", (detail) => {
    handleNativeNotification({ type: "receive", ...detail });
  }, []);

  useWindowEvent("recording-track-limit-reached", (detail) => {
    const session = sessionRef.current;
    const manager = managerRef.current;
    if (!session || !manager || manager.getSessionId() !== detail.sessionId) return;
    if (session.getState().type === "acquiring") {
      pendingTrackLimitsRef.current.push(detail);
      return;
    }
    session.dispatch({ type: "TRACK_LIMIT_REACHED", ...detail });
  }, []);

  const startRecording = useCallback(() => {
    const tracks: TrackKind[] = [];
    if (micEnabled) tracks.push("mic");
    if (systemAudioEnabled) tracks.push("system");
    if (tracks.length === 0) return;
    setRecordingError(null);
    sessionRef.current?.dispatch({ type: "START", requestedTracks: tracks });
  }, [micEnabled, systemAudioEnabled, setRecordingError]);

  const stopRecording = useCallback(() => {
    sessionRef.current?.dispatch({ type: "STOP" });
  }, []);

  const recordingState = selectRecordingState(sessionState);

  return { recordingState, sessionState, startRecording, stopRecording };
}
