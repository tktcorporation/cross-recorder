import { Effect } from "effect";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  APP_DATA_DIR,
  RECORDINGS_DIR,
  WAV_HEADER_SIZE,
} from "../../shared/constants.js";
import { FileWriteError, FileReadError } from "../../shared/errors.js";
import type { RecordingConfig, RecordingMetadata } from "../../shared/types.js";

type SessionState = {
  fd: number;
  filePath: string;
  bytesWritten: number;
};

const sessions = new Map<string, SessionState>();

const recordingsDir = path.join(
  os.homedir(),
  APP_DATA_DIR,
  RECORDINGS_DIR,
);

function writeWavHeader(
  fd: number,
  config: RecordingConfig,
  dataSize: number,
): void {
  const buf = Buffer.alloc(WAV_HEADER_SIZE);
  const byteRate =
    config.sampleRate * config.channels * (config.bitDepth / 8);
  const blockAlign = config.channels * (config.bitDepth / 8);

  // RIFF header
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);

  // fmt sub-chunk
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); // sub-chunk size
  buf.writeUInt16LE(1, 20); // PCM format
  buf.writeUInt16LE(config.channels, 22);
  buf.writeUInt32LE(config.sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(config.bitDepth, 34);

  // data sub-chunk
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);

  fs.writeSync(fd, buf, 0, WAV_HEADER_SIZE, 0);
}

export function startSession(sessionId: string, config: RecordingConfig) {
  return Effect.tryPromise({
    try: async () => {
      await Bun.write(Bun.file(recordingsDir + "/.keep"), "");
      fs.mkdirSync(recordingsDir, { recursive: true });

      const filePath = path.join(recordingsDir, `${sessionId}.wav`);
      const fd = fs.openSync(filePath, "w");

      // Write placeholder WAV header
      writeWavHeader(fd, config, 0);

      sessions.set(sessionId, { fd, filePath, bytesWritten: 0 });

      return { success: true as const, filePath };
    },
    catch: (error) =>
      new FileWriteError({
        path: path.join(recordingsDir, `${sessionId}.wav`),
        reason: String(error),
      }),
  });
}

export function writeChunk(sessionId: string, pcmData: string) {
  return Effect.tryPromise({
    try: async () => {
      const session = sessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      const buffer = Buffer.from(pcmData, "base64");
      fs.writeSync(session.fd, buffer, 0, buffer.length);
      session.bytesWritten += buffer.length;

      return { success: true as const, bytesWritten: session.bytesWritten };
    },
    catch: (error) =>
      new FileWriteError({
        path: sessions.get(sessionId)?.filePath ?? sessionId,
        reason: String(error),
      }),
  });
}

export function finalizeRecording(
  sessionId: string,
  config: RecordingConfig,
  _totalChunks: number,
) {
  return Effect.tryPromise({
    try: async () => {
      const session = sessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      // Rewrite WAV header with correct data size
      writeWavHeader(session.fd, config, session.bytesWritten);
      fs.closeSync(session.fd);

      // Rename to timestamped filename
      const now = new Date();
      const timestamp = now
        .toISOString()
        .replace(/T/, "_")
        .replace(/:/g, "-")
        .replace(/\.\d{3}Z$/, "");
      const newFileName = `${timestamp}.wav`;
      const newFilePath = path.join(recordingsDir, newFileName);
      fs.renameSync(session.filePath, newFilePath);

      const stat = fs.statSync(newFilePath);
      const durationMs = Math.round(
        (session.bytesWritten /
          (config.sampleRate * config.channels * (config.bitDepth / 8))) *
          1000,
      );

      const metadata: RecordingMetadata = {
        id: sessionId,
        fileName: newFileName,
        filePath: newFilePath,
        createdAt: now.toISOString(),
        durationMs,
        fileSizeBytes: stat.size,
        config,
      };

      sessions.delete(sessionId);
      return metadata;
    },
    catch: (error) =>
      new FileWriteError({
        path: sessions.get(sessionId)?.filePath ?? sessionId,
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

      fs.closeSync(session.fd);
      if (fs.existsSync(session.filePath)) {
        fs.unlinkSync(session.filePath);
      }

      sessions.delete(sessionId);
      return { success: true as const };
    },
    catch: (error) =>
      new FileReadError({
        path: sessions.get(sessionId)?.filePath ?? sessionId,
        reason: String(error),
      }),
  });
}
