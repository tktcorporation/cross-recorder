export type AudioDevice = {
  deviceId: string;
  label: string;
  kind: "audioinput" | "audiooutput";
  isDefault: boolean;
};

export type RecordingState = "idle" | "recording" | "stopping";

export type RecordingConfig = {
  sampleRate: number;
  channels: number;
  bitDepth: number;
  micEnabled: boolean;
  systemAudioEnabled: boolean;
  micDeviceId: string | null;
};

export type RecordingMetadata = {
  id: string;
  fileName: string;
  filePath: string;
  createdAt: string;
  durationMs: number;
  fileSizeBytes: number;
  config: RecordingConfig;
};

export type RecordingStatus = {
  state: RecordingState;
  elapsedMs: number;
  fileSizeBytes: number;
};
