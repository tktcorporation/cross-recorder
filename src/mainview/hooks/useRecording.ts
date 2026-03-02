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
    updateStatus(0, 0);
  }

  async function handleAcquiring(requestedTracks: TrackKind[]) {
    try {
      const { AudioCaptureManager: ACM } = await import(
        "@audio/AudioCaptureManager.js"
      );

      const manager = new ACM({
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

      const sessionId = await manager.start({
        micEnabled: requestedTracks.includes("mic"),
        systemAudioEnabled: requestedTracks.includes("system"),
        micDeviceId: selectedMicId ?? undefined,
      });

      // Expose AnalyserNodes
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
  const handleStateTransition = useCallback(
    (state: SessionState) => {
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
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      setSessionState,
      setRecordingState,
      setCurrentSessionId,
      setRecordingError,
      setMicAnalyser,
      setSystemAnalyser,
      updateStatus,
      addRecording,
      selectedMicId,
      request,
    ],
  );

  // Initialize RecordingSession
  useEffect(() => {
    const session = new RecordingSession();
    sessionRef.current = session;

    const unsub = session.on("stateChange", (state) => {
      handleStateTransition(state);
    });

    return () => {
      unsub();
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      managerRef.current?.cancel();
    };
  }, [handleStateTransition]);

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
