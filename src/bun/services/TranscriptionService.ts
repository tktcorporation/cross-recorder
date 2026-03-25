import { Effect } from "effect";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  APP_DATA_DIR,
  DEFAULT_WHISPER_API_BASE_URL,
  DEFAULT_WHISPER_MODEL,
  TRANSCRIPTION_CONFIG_FILE,
} from "../../shared/constants.js";
import {
  FileReadError,
  FileWriteError,
  TranscriptionError,
} from "../../shared/errors.js";
import type {
  RecordingMetadata,
  TrackKind,
  TranscriptionConfig,
  TranscriptionResult,
} from "../../shared/types.js";
import * as NativeTranscription from "./NativeTranscription.js";
import * as RecordingManager from "./RecordingManager.js";

const configPath = path.join(
  os.homedir(),
  APP_DATA_DIR,
  TRANSCRIPTION_CONFIG_FILE,
);

const defaultConfig: TranscriptionConfig = {
  apiKey: "",
  apiBaseUrl: DEFAULT_WHISPER_API_BASE_URL,
  model: DEFAULT_WHISPER_MODEL,
  language: "ja",
  useNative: true,
};

/**
 * 文字起こし設定を読み込む。
 * 未設定の場合はデフォルト値（ネイティブ優先、API キー空）を返す。
 */
export function loadConfig() {
  return Effect.tryPromise({
    try: async () => {
      if (!fs.existsSync(configPath)) {
        return defaultConfig;
      }
      const raw = fs.readFileSync(configPath, "utf-8");
      const saved = JSON.parse(raw) as Partial<TranscriptionConfig>;
      return { ...defaultConfig, ...saved };
    },
    catch: (error) =>
      new FileReadError({ path: configPath, reason: String(error) }),
  });
}

/**
 * 文字起こし設定を保存する。
 */
export function saveConfig(config: TranscriptionConfig) {
  return Effect.tryPromise({
    try: async () => {
      const dir = path.dirname(configPath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    },
    catch: (error) =>
      new FileWriteError({ path: configPath, reason: String(error) }),
  });
}

/**
 * 指定した録音の指定トラックを文字起こしする。
 *
 * 背景: 録音完了後にユーザーが手動で実行する。
 * macOS でネイティブが利用可能かつ useNative=true の場合は Speech.framework を使用し、
 * それ以外の場合は OpenAI Whisper API にフォールバックする。
 * 結果は録音ディレクトリ内の .txt ファイルに保存し、メタデータにも記録する。
 *
 * @param recording - 対象の録音メタデータ
 * @param trackKind - 文字起こし対象のトラック（"mic" or "system"）
 */
export function transcribe(recording: RecordingMetadata, trackKind: TrackKind) {
  return Effect.gen(function* () {
    const config = yield* loadConfig();

    const track = recording.tracks.find((t) => t.trackKind === trackKind);
    if (!track) {
      return yield* Effect.fail(
        new TranscriptionError({
          reason: `Track "${trackKind}" not found in recording "${recording.id}".`,
        }),
      );
    }

    if (!fs.existsSync(track.filePath)) {
      return yield* Effect.fail(
        new TranscriptionError({
          reason: `Audio file not found: ${track.filePath}`,
        }),
      );
    }

    // ネイティブ文字起こしを試みるか判定
    const shouldUseNative =
      config.useNative && NativeTranscription.isAvailable();

    let text: string;

    if (shouldUseNative) {
      // macOS ネイティブ (Speech.framework) で文字起こし
      text = yield* Effect.tryPromise({
        try: () =>
          NativeTranscription.transcribe(track.filePath, config.language),
        catch: (error) =>
          new TranscriptionError({ reason: String(error) }),
      });
    } else {
      // OpenAI Whisper API で文字起こし
      if (!config.apiKey) {
        return yield* Effect.fail(
          new TranscriptionError({
            reason:
              "API key is not configured. Please set your OpenAI API key in transcription settings, or enable native transcription on macOS.",
          }),
        );
      }

      text = yield* Effect.tryPromise({
        try: () => callWhisperApi(config, track.filePath),
        catch: (error) =>
          new TranscriptionError({ reason: String(error) }),
      });
    }

    // 結果を .txt ファイルに保存
    const txtFileName = `${trackKind}-transcription.txt`;
    const txtPath = path.join(recording.filePath, txtFileName);
    yield* Effect.tryPromise({
      try: async () => {
        fs.writeFileSync(txtPath, text, "utf-8");
      },
      catch: (error) =>
        new FileWriteError({ path: txtPath, reason: String(error) }),
    });

    const result: TranscriptionResult = {
      status: "done",
      text,
      trackKind,
    };

    // メタデータを更新
    yield* RecordingManager.updateRecording(recording.id, {
      transcription: result,
    });

    return result;
  });
}

/**
 * OpenAI Whisper API (互換) を呼び出して音声ファイルをテキストに変換する。
 *
 * multipart/form-data で WAV ファイルを送信する。
 * Bun のネイティブ Fetch API と File API を使用。
 */
async function callWhisperApi(
  config: TranscriptionConfig,
  audioFilePath: string,
): Promise<string> {
  const fileBuffer = fs.readFileSync(audioFilePath);
  const fileName = path.basename(audioFilePath);
  const file = new File([fileBuffer], fileName, { type: "audio/wav" });

  const formData = new FormData();
  formData.append("file", file);
  formData.append("model", config.model);
  if (config.language) {
    formData.append("language", config.language);
  }
  formData.append("response_format", "text");

  const url = `${config.apiBaseUrl.replace(/\/+$/, "")}/audio/transcriptions`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Whisper API error (${response.status}): ${errorBody}`,
    );
  }

  const text = await response.text();
  return text.trim();
}
