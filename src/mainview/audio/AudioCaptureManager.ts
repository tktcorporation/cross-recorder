import { nanoid } from "nanoid";
import type { RecordingMetadata, TrackKind } from "@shared/types.js";
import { DEFAULT_SAMPLE_RATE, DEFAULT_BIT_DEPTH } from "@shared/constants.js";
import { MicrophoneCapture } from "./MicrophoneCapture.js";
import { SystemAudioCapture } from "./SystemAudioCapture.js";
import { RecordingPipeline } from "./RecordingPipeline.js";

import type { RecordingConfig } from "@shared/types.js";

type RpcRequest = {
  startRecordingSession: (params: {
    sessionId: string;
    config: RecordingConfig;
    tracks: Array<{ trackKind: TrackKind; channels: number }>;
  }) => Promise<{ success: boolean; filePath: string }>;
  saveRecordingChunk: (params: {
    sessionId: string;
    trackKind: TrackKind;
    chunkIndex: number;
    pcmData: string;
  }) => Promise<{ success: boolean; bytesWritten: number }>;
  finalizeRecording: (params: {
    sessionId: string;
    config: RecordingConfig;
    totalChunks: Record<TrackKind, number>;
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
  private chunkIndex: Record<TrackKind, number> = { mic: 0, system: 0 };
  private startTime = 0;
  private totalBytes = 0;
  private currentConfig: RecordingConfig | null = null;
  private activeTracks: Array<{ trackKind: TrackKind; channels: number }> = [];
  private onTrackEndedCallback: (() => void) | null = null;

  constructor(private rpcRequest: RpcRequest) {
    this.pipeline = new RecordingPipeline();
    this.micCapture = new MicrophoneCapture();
    this.systemCapture = new SystemAudioCapture();
  }

  onTrackEnded(callback: () => void): void {
    this.onTrackEndedCallback = callback;
  }

  async start(config: {
    micDeviceId?: string;
    micEnabled: boolean;
    systemAudioEnabled: boolean;
  }): Promise<string> {
    this.sessionId = nanoid();
    this.chunkIndex = { mic: 0, system: 0 };
    this.totalBytes = 0;
    this.startTime = performance.now();
    this.activeTracks = [];

    await this.pipeline.initialize(DEFAULT_SAMPLE_RATE);

    // Build tracks list
    const tracks: Array<{ trackKind: TrackKind; channels: number }> = [];
    if (config.micEnabled) {
      tracks.push({ trackKind: "mic", channels: 1 });
    }
    if (config.systemAudioEnabled) {
      tracks.push({ trackKind: "system", channels: 2 });
    }
    this.activeTracks = tracks;

    const recordingConfig: RecordingConfig = {
      sampleRate: DEFAULT_SAMPLE_RATE,
      channels: 2,
      bitDepth: DEFAULT_BIT_DEPTH,
      micEnabled: config.micEnabled,
      systemAudioEnabled: config.systemAudioEnabled,
      micDeviceId: config.micDeviceId ?? null,
    };
    this.currentConfig = recordingConfig;

    await this.rpcRequest.startRecordingSession({
      sessionId: this.sessionId,
      config: recordingConfig,
      tracks,
    });

    try {
      // Set up each track independently
      if (config.micEnabled) {
        const micStream = await this.micCapture.start(config.micDeviceId);
        this.pipeline.addTrack("mic", micStream, 1, (data: ArrayBuffer) => {
          this.totalBytes += data.byteLength;
          const base64 = arrayBufferToBase64(data);
          this.rpcRequest.saveRecordingChunk({
            sessionId: this.sessionId!,
            trackKind: "mic",
            chunkIndex: this.chunkIndex.mic++,
            pcmData: base64,
          });
        });
      }

      if (config.systemAudioEnabled) {
        const systemStream = await this.systemCapture.start();
        this.systemCapture.onTrackEnded(() => {
          this.onTrackEndedCallback?.();
        });
        this.pipeline.addTrack(
          "system",
          systemStream,
          2,
          (data: ArrayBuffer) => {
            this.totalBytes += data.byteLength;
            const base64 = arrayBufferToBase64(data);
            this.rpcRequest.saveRecordingChunk({
              sessionId: this.sessionId!,
              trackKind: "system",
              chunkIndex: this.chunkIndex.system++,
              pcmData: base64,
            });
          },
        );
      }
    } catch (err) {
      // Clean up any partially-started resources
      this.pipeline.stop();
      this.micCapture.stop();
      this.systemCapture.stop();
      const sid = this.sessionId;
      this.sessionId = null;
      await this.rpcRequest.cancelRecording({ sessionId: sid });
      throw err;
    }

    return this.sessionId;
  }

  async stop(): Promise<RecordingMetadata> {
    if (!this.sessionId) {
      throw new Error("No active recording session");
    }

    this.pipeline.stop();
    this.micCapture.stop();
    this.systemCapture.stop();

    const totalChunks: Record<TrackKind, number> = { mic: 0, system: 0 };
    for (const track of this.activeTracks) {
      totalChunks[track.trackKind] = this.chunkIndex[track.trackKind];
    }

    const metadata = await this.rpcRequest.finalizeRecording({
      sessionId: this.sessionId,
      config: this.currentConfig!,
      totalChunks,
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

  getMicAnalyser(): AnalyserNode | null {
    return this.pipeline.getAnalyserForTrack("mic");
  }

  getSystemAnalyser(): AnalyserNode | null {
    return this.pipeline.getAnalyserForTrack("system");
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
