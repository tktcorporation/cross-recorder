import type { RPCSchema } from "electrobun/bun";
import type {
  AudioDevice,
  RecordingConfig,
  RecordingMetadata,
  RecordingState,
  TrackKind,
  UpdateStatus,
} from "./types.js";

export type CrossRecorderRPC = {
  bun: RPCSchema<{
    requests: {
      startRecordingSession: {
        params: {
          sessionId: string;
          config: RecordingConfig;
          tracks: Array<{ trackKind: TrackKind; channels: number }>;
        };
        response: { success: boolean; filePath: string };
      };
      saveRecordingChunk: {
        params: {
          sessionId: string;
          trackKind: TrackKind;
          chunkIndex: number;
          pcmData: string;
        };
        response: { success: boolean; bytesWritten: number };
      };
      finalizeRecording: {
        params: {
          sessionId: string;
          config: RecordingConfig;
          totalChunks: Record<TrackKind, number>;
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
      getPlaybackData: {
        params: { filePath: string };
        response: { data: string; mimeType: string };
      };
      checkForUpdate: {
        params: Record<string, never>;
        response: {
          version: string;
          updateAvailable: boolean;
          error: string;
        };
      };
      downloadUpdate: {
        params: Record<string, never>;
        response: { success: boolean; error: string };
      };
      applyUpdate: {
        params: Record<string, never>;
        response: { success: boolean; error: string };
      };
      getAppVersion: {
        params: Record<string, never>;
        response: { version: string; channel: string };
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
      updateStatus: {
        status: UpdateStatus;
        message: string;
        progress?: number;
      };
    };
  }>;
};
