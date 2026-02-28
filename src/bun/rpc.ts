import { BrowserView } from "electrobun/bun";
import { Effect } from "effect";
import type { CrossRecorderRPC } from "../shared/rpc-schema.js";
import type { RecordingConfig, TrackKind } from "../shared/types.js";
import * as FileService from "./services/FileService.js";
import * as RecordingManager from "./services/RecordingManager.js";
import * as UpdateService from "./services/UpdateService.js";

export const rpc = BrowserView.defineRPC<CrossRecorderRPC>({
  handlers: {
    requests: {
      startRecordingSession: async (params: {
        sessionId: string;
        config: RecordingConfig;
        tracks: Array<{ trackKind: TrackKind; channels: number }>;
      }) => {
        return Effect.runPromise(
          FileService.startSession(params.sessionId, params.config, params.tracks),
        );
      },

      saveRecordingChunk: async (params: {
        sessionId: string;
        trackKind: TrackKind;
        chunkIndex: number;
        pcmData: string;
      }) => {
        return Effect.runPromise(
          FileService.writeChunk(params.sessionId, params.trackKind, params.pcmData),
        );
      },

      finalizeRecording: async (params: {
        sessionId: string;
        config: RecordingConfig;
        totalChunks: Record<TrackKind, number>;
      }) => {
        const metadata = await Effect.runPromise(
          FileService.finalizeRecording(
            params.sessionId,
            params.config,
            params.totalChunks,
          ),
        );
        await Effect.runPromise(RecordingManager.addRecording(metadata));
        return metadata;
      },

      cancelRecording: async (params: { sessionId: string }) => {
        return Effect.runPromise(FileService.cancelSession(params.sessionId));
      },

      getRecordings: async () => {
        return Effect.runPromise(RecordingManager.getRecordings());
      },

      deleteRecording: async (params: { recordingId: string }) => {
        return Effect.runPromise(
          RecordingManager.deleteRecording(params.recordingId),
        );
      },

      openFileLocation: async (params: { filePath: string }) => {
        return Effect.runPromise(FileService.openFileLocation(params.filePath));
      },

      getPlaybackData: async (params: { filePath: string }) => {
        return Effect.runPromise(FileService.getPlaybackData(params.filePath));
      },

      checkForUpdate: async () => {
        return Effect.runPromise(UpdateService.checkForUpdate());
      },

      downloadUpdate: async () => {
        return Effect.runPromise(UpdateService.downloadUpdate());
      },

      applyUpdate: async () => {
        return Effect.runPromise(UpdateService.applyUpdate());
      },

      getAppVersion: async () => {
        return Effect.runPromise(UpdateService.getAppVersion());
      },
    },

    messages: {
      logFromRenderer: (payload: { level: string; message: string }) => {
        console.log(`[renderer:${payload.level}]`, payload.message);
      },
    },
  },
});
