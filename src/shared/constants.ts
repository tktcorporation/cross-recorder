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

/** 設定ファイル名 */
export const CONFIG_FILE = "config.json";

/** アプリデータディレクトリ名 */
export const APP_DATA_DIR = "cross-recorder";
