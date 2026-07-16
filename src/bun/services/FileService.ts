import { Effect } from "effect";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  APP_DATA_DIR,
  DOWNLOADS_DIR,
  RECORDINGS_DIR,
  WAV_HEADER_SIZE,
} from "../../shared/constants.js";
import {
  FileWriteError,
  FileReadError,
  ShellCommandError,
} from "../../shared/errors.js";
import type {
  ExportFormat,
  RecordingConfig,
  RecordingMetadata,
  TrackKind,
  TrackInfo,
} from "../../shared/types.js";

type TrackState = {
  fd: number;
  filePath: string;
  bytesWritten: number;
  channels: number;
  /** MAX_WAV_DATA_SIZE 到達の警告ログを一度だけ出すためのフラグ。 */
  sizeLimitWarned: boolean;
};

type SessionState = {
  sessionDir: string;
  tracks: Map<TrackKind, TrackState>;
  config: RecordingConfig;
  lastHeaderCheckpointAt: number;
};

const sessions = new Map<string, SessionState>();

const recordingsDir = path.join(
  os.homedir(),
  APP_DATA_DIR,
  RECORDINGS_DIR,
);

/**
 * WAV の data チャンクサイズ・RIFF チャンクサイズは 32bit unsigned で書き込まれる
 * (writeWavHeader 参照)。RIFF 側は 36 + dataSize を書くため、dataSize の上限は
 * 0xFFFFFFFF - 36。48kHz/16bit/stereo で約6.2時間、mono で約12.4時間に相当する。
 * 超過すると Buffer.writeUInt32LE が RangeError を投げ、finalizeRecording の
 * ヘッダー書き込みループが中断して録音全体が失われるため、書き込み側であらかじめ
 * この上限でトラックへの書き込みを打ち切る。
 */
export const MAX_WAV_DATA_SIZE = 0xffffffff - 36;

/**
 * クラッシュ・強制終了時のデータ保護のため、この間隔でヘッダーの data サイズを
 * 実際の書き込み済みバイト数へ書き直す。プロセスが finalizeRecording の前に
 * 不意に終了しても、直近この時間分の録音しか失われない。
 */
export const HEADER_CHECKPOINT_INTERVAL_MS = 2000;

/**
 * buffer のうち track に書き込める範囲（バイト数）を 32bit サイズ上限でクランプする。
 * 上限でチャンクを打ち切る場合、frameSize (channels * bytesPerSample) の倍数に
 * 切り捨てて、末尾のサンプルフレームがチャンネル数の途中で終わらないようにする
 * （境界に達していない通常の書き込みは frameSize に関わらずそのまま通す）。
 */
export function clampChunkForTrack(
  bytesWritten: number,
  chunkLength: number,
  maxSize: number = MAX_WAV_DATA_SIZE,
  frameSize: number = 1,
): number {
  const remaining = maxSize - bytesWritten;
  if (remaining <= 0) return 0;
  if (chunkLength <= remaining) return chunkLength;
  return remaining - (remaining % frameSize);
}

export function isCheckpointDue(
  lastCheckpointAt: number,
  now: number,
  intervalMs: number = HEADER_CHECKPOINT_INTERVAL_MS,
): boolean {
  return now - lastCheckpointAt >= intervalMs;
}

function writeWavHeader(
  fd: number,
  channels: number,
  sampleRate: number,
  bitDepth: number,
  dataSize: number,
): void {
  const buf = Buffer.alloc(WAV_HEADER_SIZE);
  const byteRate = sampleRate * channels * (bitDepth / 8);
  const blockAlign = channels * (bitDepth / 8);

  // RIFF header
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);

  // fmt sub-chunk
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); // sub-chunk size
  buf.writeUInt16LE(1, 20); // PCM format
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(bitDepth, 34);

  // data sub-chunk
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);

  fs.writeSync(fd, buf, 0, WAV_HEADER_SIZE, 0);
}

export function startSession(
  sessionId: string,
  config: RecordingConfig,
  tracks: Array<{ trackKind: TrackKind; channels: number }>,
) {
  return Effect.tryPromise({
    try: async () => {
      fs.mkdirSync(recordingsDir, { recursive: true });

      const sessionDir = path.join(recordingsDir, sessionId);
      fs.mkdirSync(sessionDir, { recursive: true });

      const trackMap = new Map<TrackKind, TrackState>();

      for (const track of tracks) {
        const filePath = path.join(sessionDir, `${track.trackKind}.wav`);
        const fd = fs.openSync(filePath, "w");

        writeWavHeader(fd, track.channels, config.sampleRate, config.bitDepth, 0);

        trackMap.set(track.trackKind, {
          fd,
          filePath,
          bytesWritten: 0,
          channels: track.channels,
          sizeLimitWarned: false,
        });
      }

      sessions.set(sessionId, {
        sessionDir,
        tracks: trackMap,
        config,
        lastHeaderCheckpointAt: Date.now(),
      });

      return { success: true as const, filePath: sessionDir };
    },
    catch: (error) =>
      new FileWriteError({
        path: path.join(recordingsDir, sessionId),
        reason: String(error),
      }),
  });
}

/**
 * セッション内の全トラックのヘッダーを現在の bytesWritten で書き直す。
 * finalizeRecording の最終ヘッダー書き込みもこの関数を使うことで、
 * ヘッダーが常に session.config（起動時に固定された設定）のみを参照する
 * ようにし、複数箇所で config の値がずれる余地をなくしている。
 */
function checkpointHeaders(session: SessionState): void {
  for (const track of session.tracks.values()) {
    writeWavHeader(
      track.fd,
      track.channels,
      session.config.sampleRate,
      session.config.bitDepth,
      track.bytesWritten,
    );
  }
}

function checkpointHeadersIfDue(session: SessionState, now: number): void {
  if (!isCheckpointDue(session.lastHeaderCheckpointAt, now)) return;
  session.lastHeaderCheckpointAt = now;
  checkpointHeaders(session);
}

function writeChunkToTrack(
  sessionId: string,
  trackKind: TrackKind,
  buffer: Buffer,
): { success: true; chunkSizeBytes: number } {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);

  const track = session.tracks.get(trackKind);
  if (!track) throw new Error(`Track not found: ${trackKind} in session ${sessionId}`);

  // 空チャンクは「上限到達」ではないので、そのシグナルと混同しないよう
  // clampChunkForTrack に渡す前に弾く（渡すと remaining に関わらず 0 になり、
  // 上限到達の警告が誤発火して sizeLimitWarned を消費してしまう）。
  if (buffer.length === 0) {
    return { success: true, chunkSizeBytes: 0 };
  }

  const frameSize = track.channels * (session.config.bitDepth / 8);
  const writable = clampChunkForTrack(
    track.bytesWritten,
    buffer.length,
    MAX_WAV_DATA_SIZE,
    frameSize,
  );
  if (writable <= 0) {
    if (!track.sizeLimitWarned) {
      track.sizeLimitWarned = true;
      console.warn(
        `[FileService] Track "${trackKind}" reached the WAV format's 32-bit size limit ` +
          `(${MAX_WAV_DATA_SIZE} bytes); further audio for this track will not be recorded ` +
          `(session ${sessionId}). Other tracks keep recording normally.`,
      );
    }
    return { success: true, chunkSizeBytes: 0 };
  }

  const toWrite = writable < buffer.length ? buffer.subarray(0, writable) : buffer;
  // 明示的に書き込み位置を指定する。fd の暗黙カーソルは位置指定なしの
  // write でのみ進み、writeWavHeader の位置指定 (position=0) 書き込みでは
  // 進まない。位置指定なしで書くと常にファイル先頭 (カーソル=0) から書き
  // 始めてしまい、ヘッダーを録音データで上書きしてしまうため、ヘッダー分の
  // オフセットと累計書き込み済みバイト数から書き込み位置を毎回計算する。
  fs.writeSync(
    track.fd,
    toWrite,
    0,
    toWrite.length,
    WAV_HEADER_SIZE + track.bytesWritten,
  );
  track.bytesWritten += toWrite.length;

  checkpointHeadersIfDue(session, Date.now());

  return { success: true, chunkSizeBytes: toWrite.length };
}

/** Synchronous write for NativeSystemAudioCapture callback. */
export function writeChunkSync(
  sessionId: string,
  trackKind: TrackKind,
  buffer: Buffer,
): void {
  writeChunkToTrack(sessionId, trackKind, buffer);
}

/** Effect-wrapped write for RPC handler (accepts Buffer, not base64). */
export function writeChunk(sessionId: string, trackKind: TrackKind, buffer: Buffer) {
  return Effect.try({
    try: () => writeChunkToTrack(sessionId, trackKind, buffer),
    catch: (error) =>
      new FileWriteError({
        path: sessions.get(sessionId)?.sessionDir ?? sessionId,
        reason: String(error),
      }),
  });
}

export function finalizeRecording(
  sessionId: string,
  config: RecordingConfig,
  _totalChunks: Record<TrackKind, number>,
) {
  return Effect.gen(function* () {
    const session = sessions.get(sessionId);
    if (!session) {
      return yield* Effect.fail(
        new FileWriteError({
          path: sessionId,
          reason: `Session not found: ${sessionId}`,
        }),
      );
    }

    return yield* Effect.try({
      try: () => {
        // 最終ヘッダーを書き直してから FD を閉じる（checkpointHeaders と
        // 同じ関数を使うことで、途中のチェックポイントと最終ヘッダーが
        // session.config という単一の情報源から常に一致するようにする）
        checkpointHeaders(session);
        for (const track of session.tracks.values()) {
          fs.closeSync(track.fd);
        }

        // Rename session directory to timestamp-based name
        const now = new Date();
        const timestamp = now
          .toISOString()
          .replace(/T/, "_")
          .replace(/:/g, "-")
          .replace(/\.\d{3}Z$/, "");
        const newDirPath = path.join(recordingsDir, timestamp);
        fs.renameSync(session.sessionDir, newDirPath);

        // Compute duration from the longest track
        let maxBytes = 0;
        let maxChannels = config.channels;
        let totalSizeBytes = 0;

        const tracksInfo: TrackInfo[] = [];
        for (const [trackKind, track] of session.tracks.entries()) {
          const newTrackPath = path.join(newDirPath, `${trackKind}.wav`);
          const stat = fs.statSync(newTrackPath);
          totalSizeBytes += stat.size;

          tracksInfo.push({
            trackKind,
            fileName: `${trackKind}.wav`,
            filePath: newTrackPath,
            channels: track.channels,
            fileSizeBytes: stat.size,
          });

          if (track.bytesWritten > maxBytes) {
            maxBytes = track.bytesWritten;
            maxChannels = track.channels;
          }
        }

        const durationMs = Math.round(
          (maxBytes /
            (config.sampleRate * maxChannels * (config.bitDepth / 8))) *
            1000,
        );

        const metadata: RecordingMetadata = {
          id: sessionId,
          fileName: timestamp,
          filePath: newDirPath,
          tracks: tracksInfo,
          createdAt: now.toISOString(),
          durationMs,
          fileSizeBytes: totalSizeBytes,
          config,
        };

        sessions.delete(sessionId);
        return metadata;
      },
      catch: (error) =>
        new FileWriteError({
          path: session.sessionDir,
          reason: String(error),
        }),
    });
  });
}

export function getPlaybackData(filePath: string) {
  return Effect.tryPromise({
    try: async () => {
      const fileBuffer = fs.readFileSync(filePath);
      const base64 = fileBuffer.toString("base64");
      return { data: base64, mimeType: "audio/wav" };
    },
    catch: (error) =>
      new FileReadError({
        path: filePath,
        reason: String(error),
      }),
  });
}

export function openFileLocation(filePath: string) {
  return Effect.tryPromise({
    try: async () => {
      const platform = process.platform;
      if (platform === "darwin") {
        Bun.spawn(["open", "-R", filePath]);
      } else if (platform === "win32") {
        Bun.spawn(["explorer", "/select,", filePath]);
      } else {
        const dir = filePath.substring(0, filePath.lastIndexOf("/"));
        Bun.spawn(["xdg-open", dir]);
      }
    },
    catch: (error) =>
      new ShellCommandError({
        command: "openFileLocation",
        reason: String(error),
      }),
  });
}

const downloadsDir = path.join(os.homedir(), DOWNLOADS_DIR);

/**
 * ファイル名として安全な文字列に整える。
 * パス区切りと OS で禁止される文字、制御文字のみ除去し、
 * 録音名のタイムスタンプに含まれるハイフン・アンダースコアは保持する。
 */
function sanitizeBaseName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const base = name.replace(/[/\\]/g, "_").replace(/[<>:"|?*\u0000-\u001f]/g, "");
  return base.trim() === "" ? "export" : base;
}

/** 既存ファイルと衝突する場合に " (1)", " (2)" を付与して未使用パスを返す。 */
function resolveUniquePath(dir: string, baseName: string, ext: string): string {
  let candidate = path.join(dir, `${baseName}.${ext}`);
  let counter = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${baseName} (${counter}).${ext}`);
    counter++;
  }
  return candidate;
}

/**
 * ミックスダウン済みの音声を ~/Downloads に書き出す。
 *
 * 背景: 録音は複数トラック (mic.wav / system.wav) に分かれて保存されるが、
 * エクスポートはフロントエンドで 1 本にミックス・エンコードしたバイト列を
 * base64 で受け取り、ユーザーが扱いやすい Downloads 配下に保存する。
 *
 * 呼び出し元: rpc.ts の exportRecording ハンドラ。
 */
export function saveExport(
  baseName: string,
  format: ExportFormat,
  buffer: Buffer,
) {
  return Effect.tryPromise({
    try: async () => {
      fs.mkdirSync(downloadsDir, { recursive: true });
      const ext = format === "mp3" ? "mp3" : "wav";
      const filePath = resolveUniquePath(
        downloadsDir,
        sanitizeBaseName(baseName),
        ext,
      );
      fs.writeFileSync(filePath, buffer);
      return { filePath };
    },
    catch: (error) =>
      new FileWriteError({
        path: downloadsDir,
        reason: String(error),
      }),
  });
}

export function cancelSession(sessionId: string) {
  return Effect.tryPromise({
    try: async () => {
      const session = sessions.get(sessionId);
      if (!session) {
        return { success: true as const };
      }

      // Close all FDs
      for (const track of session.tracks.values()) {
        fs.closeSync(track.fd);
      }

      // Delete session directory recursively
      if (fs.existsSync(session.sessionDir)) {
        fs.rmSync(session.sessionDir, { recursive: true });
      }

      sessions.delete(sessionId);
      return { success: true as const };
    },
    catch: (error) =>
      new FileWriteError({
        path: sessions.get(sessionId)?.sessionDir ?? sessionId,
        reason: String(error),
      }),
  });
}
