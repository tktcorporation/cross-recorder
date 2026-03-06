import { useCallback, useEffect, useRef } from "react";
import {
  useRecordingStore,
  selectRecordingState,
} from "../stores/recordingStore.js";
import { useRpc } from "./useRpc.js";
import { RecordingSession } from "@audio/RecordingSession.js";
import type { AudioCaptureManager } from "@audio/AudioCaptureManager.js";
import type { SessionState } from "@audio/types.js";
import type { TrackKind } from "@shared/types.js";

export function useRecording() {
  const { request } = useRpc();
  const sessionRef = useRef<RecordingSession | null>(null);
  const managerRef = useRef<AudioCaptureManager | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sessionState = useRecordingStore((s) => s.sessionState);
  const setSessionState = useRecordingStore((s) => s.setSessionState);
  const setRecordingState = useRecordingStore((s) => s.setRecordingState);
  const selectedMicId = useRecordingStore((s) => s.selectedMicId);
  const micEnabled = useRecordingStore((s) => s.micEnabled);
  const systemAudioEnabled = useRecordingStore((s) => s.systemAudioEnabled);
  const updateStatus = useRecordingStore((s) => s.updateStatus);
  const setCurrentSessionId = useRecordingStore((s) => s.setCurrentSessionId);
  const addRecording = useRecordingStore((s) => s.addRecording);
  const setMicAnalyser = useRecordingStore((s) => s.setMicAnalyser);
  const setSystemAnalyser = useRecordingStore((s) => s.setSystemAnalyser);
  const setRecordingError = useRecordingStore((s) => s.setRecordingError);
  const nativeSystemAudioAvailable = useRecordingStore(
    (s) => s.nativeSystemAudioAvailable,
  );
  const setNativeSystemAudioAvailable = useRecordingStore(
    (s) => s.setNativeSystemAudioAvailable,
  );
  const setNativeSystemLevel = useRecordingStore(
    (s) => s.setNativeSystemLevel,
  );
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
    setCurrentSessionId(null);
    setMicAnalyser(null);
    setSystemAnalyser(null);
    setNativeSystemLevel(0);
    updateStatus(0, 0);
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
        console.warn(`Track ended: ${trackKind}`);
        sessionRef.current?.dispatch({ type: "TRACK_LOST", track: trackKind });
      });
      manager.onError((reason: string) => {
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

      // Expose AnalyserNodes (system analyser is null when using native capture)
      setMicAnalyser(manager.getMicAnalyser());
      setSystemAnalyser(manager.getSystemAnalyser());

      // Notify state machine that acquisition succeeded
      sessionRef.current?.dispatch({
        type: "ACQUIRED",
        sessionId,
        tracks: requestedTracks,
      });
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
    // Update both stores
    setSessionState(state);
    setRecordingState(selectRecordingState(state));

    switch (state.type) {
      case "acquiring":
        handleAcquiring(state.requestedTracks);
        break;
      case "recording":
        setCurrentSessionId(state.sessionId);
        startStatusTimer();
        break;
      case "stopping":
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

    return () => {
      unsub();
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      managerRef.current?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for status updates from bun process
  useEffect(() => {
    const onStatus = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        state: string;
        elapsedMs: number;
        fileSizeBytes: number;
      };
      updateStatus(detail.elapsedMs, detail.fileSizeBytes);
    };
    window.addEventListener("recording-status", onStatus);
    return () => window.removeEventListener("recording-status", onStatus);
  }, [updateStatus]);

  // Listen for native system audio level updates from bun process
  useEffect(() => {
    const onLevel = (e: Event) => {
      const detail = (e as CustomEvent).detail as { level: number };
      setNativeSystemLevel(detail.level);
    };
    window.addEventListener("native-system-audio-level", onLevel);
    return () =>
      window.removeEventListener("native-system-audio-level", onLevel);
  }, [setNativeSystemLevel]);

  // Listen for native system audio errors (subprocess crash etc.)
  useEffect(() => {
    const onError = (e: Event) => {
      const detail = (e as CustomEvent).detail as { reason: string };
      console.warn("Native system audio error:", detail.reason);
      sessionRef.current?.dispatch({ type: "TRACK_LOST", track: "system" });
    };
    window.addEventListener("native-system-audio-error", onError);
    return () =>
      window.removeEventListener("native-system-audio-error", onError);
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
