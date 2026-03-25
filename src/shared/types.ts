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

export type TrackKind = "mic" | "system";

export type TrackInfo = {
  trackKind: TrackKind;
  fileName: string;
  filePath: string;
  channels: number;
  fileSizeBytes: number;
};

export type RecordingMetadata = {
  id: string;
  fileName: string;
  filePath: string;
  tracks: TrackInfo[];
  createdAt: string;
  durationMs: number;
  fileSizeBytes: number;
  config: RecordingConfig;
  /** 文字起こし結果（未実施の場合は undefined） */
  transcription?: TranscriptionResult;
};

export type RecordingStatus = {
  state: RecordingState;
  elapsedMs: number;
  fileSizeBytes: number;
};

export type TranscriptionStatus = "none" | "transcribing" | "done" | "error";

/**
 * 文字起こし結果。録音ディレクトリ内の .txt ファイルに永続化される。
 *
 * 背景: 録音後にユーザーが任意のタイミングで OpenAI Whisper API を呼び出し、
 * 音声をテキスト化する。結果は RecordingMetadata に紐づけて管理する。
 */
export type TranscriptionResult = {
  status: TranscriptionStatus;
  /** 文字起こしされたテキスト（status === "done" のとき存在） */
  text?: string;
  /** エラーメッセージ（status === "error" のとき存在） */
  error?: string;
  /** 文字起こし対象のトラック種別 */
  trackKind?: TrackKind;
};

/**
 * 文字起こし API の設定。
 * OpenAI Whisper API 互換のエンドポイントを使用する。
 */
export type TranscriptionConfig = {
  /** API キー（OpenAI or 互換サービス） */
  apiKey: string;
  /** API エンドポイント URL（デフォルト: OpenAI） */
  apiBaseUrl: string;
  /** Whisper モデル名 */
  model: string;
  /** 文字起こしの言語（ISO 639-1 コード、空文字で自動検出） */
  language: string;
};

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "up-to-date"
  | "downloading"
  | "ready"
  | "applying"
  | "error";
