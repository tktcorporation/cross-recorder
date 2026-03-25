import type { RPCSchema } from "electrobun/bun";
import type {
  AudioDevice,
  RecordingConfig,
  RecordingMetadata,
  RecordingState,
  TrackKind,
  TranscriptionConfig,
  TranscriptionResult,
  UpdateStatus,
} from "./types.js";

export type CrossRecorderRPC = {
  bun: RPCSchema<{
    requests: {
      getPlatform: {
        params: Record<string, never>;
        response: {
          platform: string;
          nativeSystemAudioAvailable: boolean;
        };
      };
      checkSystemAudioPermission: {
        params: Record<string, never>;
        response: {
          ok: boolean;
          reason?: string;
          /** プラットフォーム固有の対処法ガイダンス（バックエンドが提供） */
          hint?: string;
        };
      };
      startRecordingSession: {
        params: {
          sessionId: string;
          config: RecordingConfig;
          tracks: Array<{ trackKind: TrackKind; channels: number }>;
          nativeSystemAudio?: boolean;
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
        response: { success: boolean; chunkSizeBytes: number };
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
      /**
       * 指定した録音の指定トラックを文字起こしする。
       * OpenAI Whisper API (互換) を使用し、結果をメタデータとファイルに保存する。
       */
      transcribeRecording: {
        params: { recordingId: string; trackKind: TrackKind };
        response: TranscriptionResult;
      };
      getTranscriptionConfig: {
        params: Record<string, never>;
        response: TranscriptionConfig & {
          /** macOS ネイティブ文字起こしがこのプラットフォームで利用可能か */
          nativeAvailable: boolean;
        };
      };
      setTranscriptionConfig: {
        params: TranscriptionConfig;
        response: { success: boolean };
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
      nativeSystemAudioLevel: {
        level: number;
      };
      nativeSystemAudioError: {
        reason: string;
      };
      /** 文字起こしの進捗・完了をフロントエンドに通知する */
      transcriptionStatus: {
        recordingId: string;
        result: TranscriptionResult;
      };
    };
  }>;
};
