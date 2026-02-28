import { useCallback } from "react";
import { rpc } from "../rpc.js";

export function useRpc() {
  const request = useCallback(
    () => ({
      startRecordingSession: (params: Parameters<typeof rpc.request.startRecordingSession>[0]) =>
        rpc.request.startRecordingSession(params),
      saveRecordingChunk: (params: Parameters<typeof rpc.request.saveRecordingChunk>[0]) =>
        rpc.request.saveRecordingChunk(params),
      finalizeRecording: (params: Parameters<typeof rpc.request.finalizeRecording>[0]) =>
        rpc.request.finalizeRecording(params),
      cancelRecording: (params: Parameters<typeof rpc.request.cancelRecording>[0]) =>
        rpc.request.cancelRecording(params),
      getRecordings: (params: Parameters<typeof rpc.request.getRecordings>[0]) =>
        rpc.request.getRecordings(params),
      deleteRecording: (params: Parameters<typeof rpc.request.deleteRecording>[0]) =>
        rpc.request.deleteRecording(params),
      openFileLocation: (params: Parameters<typeof rpc.request.openFileLocation>[0]) =>
        rpc.request.openFileLocation(params),
      getPlaybackData: (params: Parameters<typeof rpc.request.getPlaybackData>[0]) =>
        rpc.request.getPlaybackData(params),
    }),
    [],
  );

  return { request: request() };
}
