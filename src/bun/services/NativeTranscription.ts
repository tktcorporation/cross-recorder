// src/bun/services/NativeTranscription.ts
//
// macOS の Speech.framework (SFSpeechRecognizer) を使用したネイティブ文字起こし。
// API キー不要・オフライン動作可能（macOS 13+ のオンデバイスモデル使用時）。
//
// NativeSystemAudioCapture と同じパターンで、Swift バイナリをサブプロセスとして起動し、
// stderr で JSON ステータス、stdout でテキスト結果を受け取る。
//
// 呼び出し元: TranscriptionService.transcribe()（macOS でネイティブが利用可能な場合）

import * as fs from "node:fs";
import * as path from "node:path";

/** ネイティブ文字起こしバイナリの名前 */
const BINARY_NAME = "transcribe-audio";

/** Swift ソースの相対パス（プロジェクトルートからの相対） */
const SWIFT_SOURCE_REL = path.join(
  "src",
  "native",
  "macos",
  "transcribe-audio.swift",
);

/**
 * ネイティブ文字起こしバイナリのパスを探す。
 * NativeSystemAudioCapture.findBinaryPath() と同じ探索戦略に加え、
 * macOS 開発環境ではバイナリが未ビルドなら Swift ソースから自動コンパイルする。
 *
 * 探索順序:
 *  1. 開発パス: build/native/transcribe-audio
 *  2. 本番パス: アプリバンドル内の native/transcribe-audio
 *  3. 自動ビルド: Swift ソースが存在すれば swiftc でコンパイル（macOS のみ）
 */
function findBinaryPath(): string | null {
  // Development: project root / build / native
  const devPath = path.join(process.cwd(), "build", "native", BINARY_NAME);
  if (fs.existsSync(devPath)) return devPath;

  // Production: relative to the bun entry (inside app bundle)
  const prodPath = path.resolve(
    import.meta.dir,
    "..",
    "..",
    "native",
    BINARY_NAME,
  );
  if (fs.existsSync(prodPath)) return prodPath;

  // Development auto-build: Swift ソースからオンデマンドでコンパイルする。
  // macOS 開発環境では swiftc が Xcode Command Line Tools で利用可能。
  // 初回のみ 2-3 秒かかるが、以降はビルド済みバイナリがキャッシュされる。
  return tryBuildFromSource();
}

/**
 * Swift ソースからバイナリをコンパイルする。
 * macOS + Swift ソースが存在する場合のみ実行。失敗時は null を返す。
 */
function tryBuildFromSource(): string | null {
  if (process.platform !== "darwin") return null;

  const srcPath = path.join(process.cwd(), SWIFT_SOURCE_REL);
  if (!fs.existsSync(srcPath)) return null;

  const outputDir = path.join(process.cwd(), "build", "native");
  const outputPath = path.join(outputDir, BINARY_NAME);

  fs.mkdirSync(outputDir, { recursive: true });

  console.log(
    "[NativeTranscription] Binary not found, auto-building from Swift source...",
  );

  const result = Bun.spawnSync(
    [
      "swiftc",
      "-O",
      "-o",
      outputPath,
      "-framework",
      "Speech",
      "-framework",
      "Foundation",
      srcPath,
    ],
    { stderr: "pipe" },
  );

  if (result.exitCode !== 0) {
    const stderr = new TextDecoder().decode(result.stderr);
    console.error("[NativeTranscription] Auto-build failed:", stderr);
    return null;
  }

  fs.chmodSync(outputPath, 0o755);
  console.log("[NativeTranscription] Auto-build succeeded:", outputPath);
  return outputPath;
}

/**
 * macOS ネイティブ文字起こしがこのプラットフォームで利用可能か。
 * macOS + バイナリが存在する（または自動ビルドできる）場合に true。
 */
export function isAvailable(): boolean {
  return process.platform === "darwin" && findBinaryPath() !== null;
}

/**
 * ネイティブ文字起こしの権限チェック。
 * SFSpeechRecognizer の認可状態を確認する。
 */
export async function checkPermission(): Promise<{
  ok: boolean;
  reason?: string;
  hint?: string;
}> {
  const binaryPath = findBinaryPath();
  if (!binaryPath) {
    return { ok: false, reason: "Native transcription binary not found" };
  }

  const proc = Bun.spawn([binaryPath, "--check"], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const decoder = new TextDecoder();
  let stderr = "";

  const stderrReader = (
    proc.stderr as ReadableStream<Uint8Array>
  ).getReader();
  try {
    for (;;) {
      const { value, done } = await stderrReader.read();
      if (done) break;
      stderr += decoder.decode(value, { stream: true });
    }
  } catch {
    /* stream closed */
  }

  await proc.exited;

  const lines = stderr.trim().split("\n");
  for (const line of lines.reverse()) {
    try {
      const msg = JSON.parse(line) as Record<string, unknown>;
      if (msg.check === "ok") return { ok: true };
      if (msg.check === "error") {
        return {
          ok: false,
          reason: String(msg.reason ?? "Unknown error"),
          hint: String(
            msg.hint ??
              "System Settings > Privacy & Security > Speech Recognition で権限を許可してください。",
          ),
        };
      }
    } catch {
      /* skip non-JSON */
    }
  }

  return {
    ok: false,
    reason: `Preflight check failed (exit code: ${proc.exitCode})`,
  };
}

/**
 * macOS ネイティブ音声認識で WAV ファイルを文字起こしする。
 *
 * @param audioFilePath 文字起こし対象の WAV ファイルパス
 * @param language BCP 47 言語コード (例: "ja-JP", "en-US")
 * @returns 文字起こしテキスト
 * @throws バイナリが見つからない・権限エラー・タイムアウト時にエラーをスロー
 */
export async function transcribe(
  audioFilePath: string,
  language: string,
): Promise<string> {
  const binaryPath = findBinaryPath();
  if (!binaryPath) {
    throw new Error("Native transcription binary not found");
  }

  // ISO 639-1 (例: "ja") → BCP 47 (例: "ja-JP") に変換
  // SFSpeechRecognizer は BCP 47 ロケールを期待する
  const bcp47Language = toBcp47(language);

  const proc = Bun.spawn(
    [binaryPath, audioFilePath, "--language", bcp47Language],
    { stdout: "pipe", stderr: "pipe" },
  );

  // stderr からステータスメッセージを読み取る
  const decoder = new TextDecoder();
  let stderr = "";
  const stderrReader = (
    proc.stderr as ReadableStream<Uint8Array>
  ).getReader();

  const stderrPromise = (async () => {
    try {
      for (;;) {
        const { value, done } = await stderrReader.read();
        if (done) break;
        stderr += decoder.decode(value, { stream: true });
      }
    } catch {
      /* stream closed */
    }
  })();

  // stdout から文字起こし結果を読み取る
  let stdout = "";
  const stdoutReader = (
    proc.stdout as ReadableStream<Uint8Array>
  ).getReader();

  const stdoutPromise = (async () => {
    try {
      for (;;) {
        const { value, done } = await stdoutReader.read();
        if (done) break;
        stdout += decoder.decode(value, { stream: true });
      }
    } catch {
      /* stream closed */
    }
  })();

  await Promise.all([proc.exited, stderrPromise, stdoutPromise]);

  // stderr からエラーを確認
  for (const line of stderr.trim().split("\n")) {
    try {
      const msg = JSON.parse(line) as Record<string, unknown>;
      if (typeof msg.error === "string") {
        throw new Error(msg.error);
      }
    } catch (e) {
      if (e instanceof Error && e.message !== line) throw e;
      /* skip non-JSON lines */
    }
  }

  if (proc.exitCode !== 0) {
    throw new Error(
      `Native transcription failed (exit code: ${proc.exitCode})`,
    );
  }

  return stdout.trim();
}

/**
 * ISO 639-1 言語コード (例: "ja") を BCP 47 ロケール (例: "ja-JP") に変換する。
 * SFSpeechRecognizer が BCP 47 形式を期待するため。
 * すでに BCP 47 形式の場合はそのまま返す。
 */
function toBcp47(language: string): string {
  if (language.includes("-") || language.includes("_")) {
    return language;
  }
  // よく使われる言語コードの変換マップ
  const map: Record<string, string> = {
    ja: "ja-JP",
    en: "en-US",
    zh: "zh-CN",
    ko: "ko-KR",
    fr: "fr-FR",
    de: "de-DE",
    es: "es-ES",
    it: "it-IT",
    pt: "pt-BR",
    ru: "ru-RU",
  };
  return map[language] ?? `${language}-${language.toUpperCase()}`;
}
