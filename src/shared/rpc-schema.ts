import type { RPCSchema } from "electrobun/bun";
import type {
  AudioDevice,
  RecordingConfig,
  RecordingMetadata,
  RecordingState,
} from "./types.js";

export type CrossRecorderRPC = {
  bun: RPCSchema<{
    requests: {
      startRecordingSession: {
        params: { sessionId: string; config: RecordingConfig };
        response: { success: boolean; filePath: string };
      };
      saveRecordingChunk: {
        params: { sessionId: string; chunkIndex: number; pcmData: string };
        response: { success: boolean; bytesWritten: number };
      };
      finalizeRecording: {
        params: {
          sessionId: string;
          config: RecordingConfig;
          totalChunks: number;
        };
        response: RecordingMetadata;
      };
      cancelRecording: {
        params: { sessionId: string };
        response: { success: boolean };
      };
      getRecordings: {
        params: Record<string, never>;
        response: RecordingMetadata[];
      };
      deleteRecording: {
        params: { recordingId: string };
        response: { success: boolean };
      };
      openFileLocation: {
        params: { filePath: string };
        response: void;
      };
      getPlaybackUrl: {
        params: { filePath: string };
        response: { url: string };
      };
    };
    messages: {
      logFromRenderer: { level: string; message: string };
    };
  }>;
  webview: RPCSchema<{
    requests: Record<string, never>;
    messages: {
      recordingStatus: {
        state: RecordingState;
        elapsedMs: number;
        fileSizeBytes: number;
      };
      deviceListChanged: { devices: AudioDevice[] };
    };
  }>;
};
