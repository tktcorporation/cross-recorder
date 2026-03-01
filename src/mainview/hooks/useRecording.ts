import { useCallback, useEffect, useRef } from "react";
import { useRecordingStore } from "../stores/recordingStore.js";
import { useRpc } from "./useRpc.js";
import type { AudioCaptureManager } from "@audio/AudioCaptureManager.js";

export function useRecording() {
  const { request } = useRpc();
  const managerRef = useRef<AudioCaptureManager | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startingRef = useRef(false);

  const recordingState = useRecordingStore((s) => s.recordingState);
  const setRecordingState = useRecordingStore((s) => s.setRecordingState);
  const selectedMicId = useRecordingStore((s) => s.selectedMicId);
  const micEnabled = useRecordingStore((s) => s.micEnabled);
  const systemAudioEnabled = useRecordingStore((s) => s.systemAudioEnabled);
  const updateStatus = useRecordingStore((s) => s.updateStatus);
  const setCurrentSessionId = useRecordingStore((s) => s.setCurrentSessionId);
  const addRecording = useRecordingStore((s) => s.addRecording);
  const setMicAnalyser = useRecordingStore((s) => s.setMicAnalyser);
  const setSystemAnalyser = useRecordingStore((s) => s.setSystemAnalyser);

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

  const startRecording = useCallback(async () => {
    // Use ref-based guard to prevent double execution across render cycles
    if (recordingState !== "idle" || startingRef.current) return;
    startingRef.current = true;

    setRecordingState("recording");

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

      const sessionId = await manager.start({
        micEnabled,
        systemAudioEnabled,
        micDeviceId: selectedMicId ?? undefined,
      });
      setCurrentSessionId(sessionId);

      // Expose AnalyserNodes for level meters
      setMicAnalyser(manager.getMicAnalyser());
      setSystemAnalyser(manager.getSystemAnalyser());

      // Start timer to update elapsed time / file size
      timerRef.current = setInterval(() => {
        if (managerRef.current) {
          updateStatus(
            managerRef.current.getElapsedMs(),
            managerRef.current.getTotalBytes(),
          );
        }
      }, 100);
    } catch (err) {
      console.error("Failed to start recording:", err);
      setRecordingState("idle");
    } finally {
      startingRef.current = false;
    }
  }, [
    recordingState,
    micEnabled,
    systemAudioEnabled,
    selectedMicId,
    setRecordingState,
    setCurrentSessionId,
    updateStatus,
    setMicAnalyser,
    setSystemAnalyser,
    request,
  ]);

  const stopRecording = useCallback(async () => {
    if (recordingState !== "recording" || !managerRef.current) return;

    setRecordingState("stopping");

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    try {
      const metadata = await managerRef.current.stop();
      addRecording(metadata);
    } catch (err) {
      console.error("Failed to stop recording:", err);
    } finally {
      managerRef.current = null;
      setCurrentSessionId(null);
      setMicAnalyser(null);
      setSystemAnalyser(null);
      updateStatus(0, 0);
      setRecordingState("idle");
    }
  }, [
    recordingState,
    setRecordingState,
    setCurrentSessionId,
    setMicAnalyser,
    setSystemAnalyser,
    updateStatus,
    addRecording,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      managerRef.current?.cancel();
    };
  }, []);

  return { recordingState, startRecording, stopRecording };
}
