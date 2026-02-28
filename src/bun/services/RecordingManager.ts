import { Effect } from "effect";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  APP_DATA_DIR,
  RECORDINGS_DIR,
} from "../../shared/constants.js";
import { FileReadError, FileWriteError, RecordingNotFoundError } from "../../shared/errors.js";
import type { RecordingMetadata } from "../../shared/types.js";

const recordingsDir = path.join(os.homedir(), APP_DATA_DIR, RECORDINGS_DIR);
const metadataPath = path.join(recordingsDir, "recordings.json");

function readMetadataFile(): RecordingMetadata[] {
  if (!fs.existsSync(metadataPath)) {
    return [];
  }
  const raw = fs.readFileSync(metadataPath, "utf-8");
  return JSON.parse(raw) as RecordingMetadata[];
}

function writeMetadataFile(recordings: RecordingMetadata[]): void {
  fs.mkdirSync(recordingsDir, { recursive: true });
  fs.writeFileSync(metadataPath, JSON.stringify(recordings, null, 2));
}

export function getRecordings() {
  return Effect.tryPromise({
    try: async () => {
      return readMetadataFile();
    },
    catch: (error) =>
      new FileReadError({
        path: metadataPath,
        reason: String(error),
      }),
  });
}

export function addRecording(metadata: RecordingMetadata) {
  return Effect.tryPromise({
    try: async () => {
      const recordings = readMetadataFile();
      recordings.push(metadata);
      writeMetadataFile(recordings);
    },
    catch: (error) =>
      new FileWriteError({
        path: metadataPath,
        reason: String(error),
      }),
  });
}

export function deleteRecording(recordingId: string) {
  return Effect.tryPromise({
    try: async () => {
      const recordings = readMetadataFile();
      const index = recordings.findIndex((r) => r.id === recordingId);
      if (index === -1) {
        throw new RecordingNotFoundError({ recordingId });
      }

      const recording = recordings[index]!;

      if (recording.tracks && recording.tracks.length > 0) {
        // New multi-track format: delete directory recursively
        const dirPath = recording.filePath;
        if (fs.existsSync(dirPath)) {
          fs.rmSync(dirPath, { recursive: true });
        }
      } else {
        // Old single-file format
        if (fs.existsSync(recording.filePath)) {
          fs.unlinkSync(recording.filePath);
        }
      }

      // Remove from metadata
      recordings.splice(index, 1);
      writeMetadataFile(recordings);

      return { success: true as const };
    },
    catch: (error) => {
      if (error instanceof RecordingNotFoundError) {
        return error;
      }
      return new FileWriteError({
        path: metadataPath,
        reason: String(error),
      });
    },
  });
}
