import { BrowserView } from "electrobun/bun";
import { Effect } from "effect";
import * as fs from "node:fs";
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
        const platform = process.platform;
        if (platform === "darwin") {
          Bun.spawn(["open", "-R", params.filePath]);
        } else if (platform === "win32") {
          Bun.spawn(["explorer", "/select,", params.filePath]);
        } else {
          const dir = params.filePath.substring(
            0,
            params.filePath.lastIndexOf("/"),
          );
          Bun.spawn(["xdg-open", dir]);
        }
      },

      getPlaybackData: async (params: { filePath: string }) => {
        const fileBuffer = fs.readFileSync(params.filePath);
        const base64 = fileBuffer.toString("base64");
        return { data: base64, mimeType: "audio/wav" };
      },

      checkForUpdate: async () => {
        return UpdateService.checkForUpdate();
      },

      downloadUpdate: async () => {
        return UpdateService.downloadUpdate();
      },

      applyUpdate: async () => {
        return UpdateService.applyUpdate();
      },

      getAppVersion: async () => {
        return UpdateService.getAppVersion();
      },
    },

    messages: {
      logFromRenderer: (payload: { level: string; message: string }) => {
        console.log(`[renderer:${payload.level}]`, payload.message);
      },
    },
  },
});
