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
import type {
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
};

type SessionState = {
  sessionDir: string;
  tracks: Map<TrackKind, TrackState>;
};

const sessions = new Map<string, SessionState>();

const recordingsDir = path.join(
  os.homedir(),
  APP_DATA_DIR,
  RECORDINGS_DIR,
);

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
        });
      }

      sessions.set(sessionId, { sessionDir, tracks: trackMap });

      return { success: true as const, filePath: sessionDir };
    },
    catch: (error) =>
      new FileWriteError({
        path: path.join(recordingsDir, sessionId),
        reason: String(error),
      }),
  });
}

export function writeChunk(sessionId: string, trackKind: TrackKind, pcmData: string) {
  return Effect.tryPromise({
    try: async () => {
      const session = sessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      const track = session.tracks.get(trackKind);
      if (!track) {
        throw new Error(`Track not found: ${trackKind} in session ${sessionId}`);
      }

      const buffer = Buffer.from(pcmData, "base64");
      fs.writeSync(track.fd, buffer, 0, buffer.length);
      track.bytesWritten += buffer.length;

      return { success: true as const, bytesWritten: track.bytesWritten };
    },
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
  return Effect.tryPromise({
    try: async () => {
      const session = sessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      // Rewrite WAV headers and close FDs for each track
      for (const track of session.tracks.values()) {
        writeWavHeader(
          track.fd,
          track.channels,
          config.sampleRate,
          config.bitDepth,
          track.bytesWritten,
        );
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
        path: sessions.get(sessionId)?.sessionDir ?? sessionId,
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
      new FileReadError({
        path: sessions.get(sessionId)?.sessionDir ?? sessionId,
        reason: String(error),
      }),
  });
}
