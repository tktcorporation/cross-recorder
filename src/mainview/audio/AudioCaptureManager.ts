import { nanoid } from "nanoid";
import type { RecordingMetadata } from "@shared/types.js";
import { DEFAULT_SAMPLE_RATE, DEFAULT_BIT_DEPTH, DEFAULT_CHANNELS } from "@shared/constants.js";
import { MicrophoneCapture } from "./MicrophoneCapture.js";
import { SystemAudioCapture } from "./SystemAudioCapture.js";
import { RecordingPipeline } from "./RecordingPipeline.js";

import type { RecordingConfig } from "@shared/types.js";

type RpcRequest = {
  startRecordingSession: (params: {
    sessionId: string;
    config: RecordingConfig;
  }) => Promise<{ success: boolean; filePath: string }>;
  saveRecordingChunk: (params: {
    sessionId: string;
    chunkIndex: number;
    pcmData: string;
  }) => Promise<{ success: boolean; bytesWritten: number }>;
  finalizeRecording: (params: {
    sessionId: string;
    config: RecordingConfig;
    totalChunks: number;
  }) => Promise<RecordingMetadata>;
  cancelRecording: (params: {
    sessionId: string;
  }) => Promise<{ success: boolean }>;
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export class AudioCaptureManager {
  private pipeline: RecordingPipeline;
  private micCapture: MicrophoneCapture;
  private systemCapture: SystemAudioCapture;
  private sessionId: string | null = null;
  private chunkIndex = 0;
  private startTime = 0;
  private totalBytes = 0;
  private currentConfig: RecordingConfig | null = null;

  constructor(private rpcRequest: RpcRequest) {
    this.pipeline = new RecordingPipeline();
    this.micCapture = new MicrophoneCapture();
    this.systemCapture = new SystemAudioCapture();
  }

  async start(config: {
    micDeviceId?: string;
    micEnabled: boolean;
    systemAudioEnabled: boolean;
  }): Promise<string> {
    this.sessionId = nanoid();
    this.chunkIndex = 0;
    this.totalBytes = 0;
    this.startTime = performance.now();

    await this.pipeline.initialize(DEFAULT_SAMPLE_RATE);

    let micStream: MediaStream | undefined;
    let systemStream: MediaStream | undefined;

    if (config.micEnabled) {
      micStream = await this.micCapture.start(config.micDeviceId);
    }

    if (config.systemAudioEnabled) {
      systemStream = await this.systemCapture.start();
    }

    const recordingConfig: RecordingConfig = {
      sampleRate: DEFAULT_SAMPLE_RATE,
      channels: DEFAULT_CHANNELS,
      bitDepth: DEFAULT_BIT_DEPTH,
      micEnabled: config.micEnabled,
      systemAudioEnabled: config.systemAudioEnabled,
      micDeviceId: config.micDeviceId ?? null,
    };
    this.currentConfig = recordingConfig;

    await this.rpcRequest.startRecordingSession({
      sessionId: this.sessionId,
      config: recordingConfig,
    });

    this.pipeline.start({
      micStream,
      systemStream,
      onPcmData: (data: ArrayBuffer) => {
        this.totalBytes += data.byteLength;
        const base64 = arrayBufferToBase64(data);
        this.rpcRequest.saveRecordingChunk({
          sessionId: this.sessionId!,
          chunkIndex: this.chunkIndex++,
          pcmData: base64,
        });
      },
    });

    return this.sessionId;
  }

  async stop(): Promise<RecordingMetadata> {
    if (!this.sessionId) {
      throw new Error("No active recording session");
    }

    this.pipeline.stop();
    this.micCapture.stop();
    this.systemCapture.stop();

    const metadata = await this.rpcRequest.finalizeRecording({
      sessionId: this.sessionId,
      config: this.currentConfig!,
      totalChunks: this.chunkIndex,
    });

    this.sessionId = null;
    return metadata;
  }

  async cancel(): Promise<void> {
    if (!this.sessionId) {
      return;
    }

    this.pipeline.stop();
    this.micCapture.stop();
    this.systemCapture.stop();

    await this.rpcRequest.cancelRecording({
      sessionId: this.sessionId,
    });

    this.sessionId = null;
  }

  getElapsedMs(): number {
    if (this.startTime === 0) return 0;
    return performance.now() - this.startTime;
  }

  getTotalBytes(): number {
    return this.totalBytes;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }
}
