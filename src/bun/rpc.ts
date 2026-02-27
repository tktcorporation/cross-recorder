import { BrowserView } from "electrobun/bun";
import { Effect } from "effect";
import type { CrossRecorderRPC } from "../shared/rpc-schema.js";
import type { RecordingConfig } from "../shared/types.js";
import * as FileService from "./services/FileService.js";
import * as RecordingManager from "./services/RecordingManager.js";

export const rpc = BrowserView.defineRPC<CrossRecorderRPC>({
  handlers: {
    requests: {
      startRecordingSession: async (params: {
        sessionId: string;
        config: RecordingConfig;
      }) => {
        return Effect.runPromise(
          FileService.startSession(params.sessionId, params.config),
        );
      },

      saveRecordingChunk: async (params: {
        sessionId: string;
        chunkIndex: number;
        pcmData: string;
      }) => {
        return Effect.runPromise(
          FileService.writeChunk(params.sessionId, params.pcmData),
        );
      },

      finalizeRecording: async (params: {
        sessionId: string;
        config: RecordingConfig;
        totalChunks: number;
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

      getPlaybackUrl: async (params: { filePath: string }) => {
        return { url: `file://${params.filePath}` };
      },
    },

    messages: {
      logFromRenderer: (payload: { level: string; message: string }) => {
        console.log(`[renderer:${payload.level}]`, payload.message);
      },
    },
  },
});
