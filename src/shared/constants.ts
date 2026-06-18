export const DEFAULT_SAMPLE_RATE = 48000;
export const DEFAULT_BIT_DEPTH = 16;
export const DEFAULT_CHANNELS = 2;

/** PCM バッファサイズ (AudioWorklet からの送信単位, フレーム数) */
export const WORKLET_BUFFER_SIZE = 4096;

/** チャンク送信間隔 (ms) */
export const CHUNK_INTERVAL_MS = 1000;

/** WAV ヘッダサイズ (bytes) */
export const WAV_HEADER_SIZE = 44;

/** 録音ファイルの保存ディレクトリ名 */
export const RECORDINGS_DIR = "recordings";

/** エクスポート先ディレクトリ名（ユーザーのホーム直下） */
export const DOWNLOADS_DIR = "Downloads";

/**
 * エクスポート時の MP3 ビットレート (kbps)。
 * 192 は音声録音用途で品質とファイルサイズのバランスが取れる値。
 */
export const EXPORT_MP3_BITRATE = 192;

/** 設定ファイル名 */
export const CONFIG_FILE = "config.json";

/** アプリデータディレクトリ名 */
export const APP_DATA_DIR = "cross-recorder";

/** 文字起こし設定ファイル名 */
export const TRANSCRIPTION_CONFIG_FILE = "transcription-config.json";

/** OpenAI Whisper API のデフォルトエンドポイント */
export const DEFAULT_WHISPER_API_BASE_URL =
  "https://api.openai.com/v1";

/** デフォルトの Whisper モデル */
export const DEFAULT_WHISPER_MODEL = "whisper-1";
