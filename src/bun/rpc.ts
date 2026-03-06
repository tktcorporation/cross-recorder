import { BrowserView } from "electrobun/bun";
import { Effect } from "effect";
import type { CrossRecorderRPC } from "../shared/rpc-schema.js";
import type { RecordingConfig, TrackKind } from "../shared/types.js";
import * as FileService from "./services/FileService.js";
import * as RecordingManager from "./services/RecordingManager.js";
import * as UpdateService from "./services/UpdateService.js";
import { NativeSystemAudioCapture } from "./services/NativeSystemAudioCapture.js";

const nativeCapture = new NativeSystemAudioCapture();

export const rpc = BrowserView.defineRPC<CrossRecorderRPC>({
  handlers: {
    requests: {
      getPlatform: async () => {
        return {
          platform: process.platform,
          nativeSystemAudioAvailable: NativeSystemAudioCapture.isAvailable(),
        };
      },

      checkSystemAudioPermission: async () => {
        if (!NativeSystemAudioCapture.isAvailable()) {
          return {
            ok: false as const,
            reason: "Native capture not available on this platform",
          };
        }
        return NativeSystemAudioCapture.checkPermission();
      },

      startRecordingSession: async (params: {
        sessionId: string;
        config: RecordingConfig;
        tracks: Array<{ trackKind: TrackKind; channels: number }>;
        nativeSystemAudio?: boolean;
      }) => {
        const result = await Effect.runPromise(
          FileService.startSession(params.sessionId, params.config, params.tracks),
        );

        // Start native system audio capture on macOS when requested
        if (params.nativeSystemAudio) {
          try {
            await nativeCapture.start(
              params.sessionId,
              params.config.sampleRate,
              (buffer) =>
                FileService.writeChunkSync(
                  params.sessionId,
                  "system",
                  buffer,
                ),
              (level) => rpc.send.nativeSystemAudioLevel({ level }),
              (reason) => rpc.send.nativeSystemAudioError({ reason }),
            );
          } catch (err) {
            // Clean up the file session on native capture failure
            await Effect.runPromise(
              FileService.cancelSession(params.sessionId),
            );
            throw err;
          }
        }

        return result;
      },

      saveRecordingChunk: async (params: {
        sessionId: string;
        trackKind: TrackKind;
        chunkIndex: number;
        pcmData: string;
      }) => {
        const buffer = Buffer.from(params.pcmData, "base64");
        return Effect.runPromise(
          FileService.writeChunk(params.sessionId, params.trackKind, buffer),
        );
      },

      finalizeRecording: async (params: {
        sessionId: string;
        config: RecordingConfig;
        totalChunks: Record<TrackKind, number>;
      }) => {
        // Stop native capture first to flush remaining PCM data
        await nativeCapture.stopIfActive(params.sessionId);

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
        await nativeCapture.stopIfActive(params.sessionId);
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
