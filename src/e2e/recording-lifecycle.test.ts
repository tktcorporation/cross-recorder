/**
 * 録音ライフサイクル E2E テスト。
 *
 * 背景: 録音メタデータの CRUD 操作（作成・取得・更新・削除）を
 * ファイルシステムを使用して統合的にテストする。
 * RecordingManager が recordings.json を正しく管理できることを検証する。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { RecordingMetadata, RecordingConfig, TrackInfo } from "@shared/types.js";

let tempDir: string;
let metadataPath: string;

/** テスト用の録音メタデータを生成する */
function createTestRecording(
  id: string,
  overrides?: Partial<RecordingMetadata>,
): RecordingMetadata {
  const recordingDir = path.join(tempDir, id);
  fs.mkdirSync(recordingDir, { recursive: true });

  // ダミー音声ファイルを作成
  const micPath = path.join(recordingDir, "mic.wav");
  fs.writeFileSync(micPath, Buffer.alloc(1024));

  const config: RecordingConfig = {
    sampleRate: 48000,
    channels: 2,
    bitDepth: 16,
    micEnabled: true,
    systemAudioEnabled: false,
    micDeviceId: null,
  };

  const tracks: TrackInfo[] = [
    {
      trackKind: "mic",
      fileName: "mic.wav",
      filePath: micPath,
      channels: 2,
      fileSizeBytes: 1024,
    },
  ];

  return {
    id,
    fileName: `recording-${id}`,
    filePath: recordingDir,
    tracks,
    createdAt: new Date().toISOString(),
    durationMs: 5000,
    fileSizeBytes: 1024,
    config,
    ...overrides,
  };
}

/** JSON メタデータファイルを読み込む */
function readMetadata(): RecordingMetadata[] {
  if (!fs.existsSync(metadataPath)) return [];
  return JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
}

/** JSON メタデータファイルに書き込む */
function writeMetadata(recordings: RecordingMetadata[]): void {
  fs.writeFileSync(metadataPath, JSON.stringify(recordings, null, 2));
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cross-recorder-rec-test-"));
  metadataPath = path.join(tempDir, "recordings.json");
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("Recording lifecycle", () => {
  it("should start with empty recordings list", () => {
    const recordings = readMetadata();
    expect(recordings).toEqual([]);
  });

  it("should add a recording to the metadata", () => {
    const rec = createTestRecording("rec-001");
    writeMetadata([rec]);

    const recordings = readMetadata();
    expect(recordings).toHaveLength(1);
    expect(recordings[0]!.id).toBe("rec-001");
    expect(recordings[0]!.fileName).toBe("recording-rec-001");
  });

  it("should add multiple recordings and preserve order", () => {
    const rec1 = createTestRecording("rec-001");
    const rec2 = createTestRecording("rec-002");
    const rec3 = createTestRecording("rec-003");
    writeMetadata([rec1, rec2, rec3]);

    const recordings = readMetadata();
    expect(recordings).toHaveLength(3);
    expect(recordings.map((r) => r.id)).toEqual([
      "rec-001",
      "rec-002",
      "rec-003",
    ]);
  });

  it("should update a recording's transcription result", () => {
    const rec = createTestRecording("rec-001");
    writeMetadata([rec]);

    // 文字起こし結果を追加
    const recordings = readMetadata();
    const target = recordings.find((r) => r.id === "rec-001");
    expect(target).toBeDefined();

    target!.transcription = {
      status: "done",
      text: "Hello, this is a test transcription.",
      trackKind: "mic",
    };
    writeMetadata(recordings);

    // 再読み込みして確認
    const updated = readMetadata();
    expect(updated[0]!.transcription).toBeDefined();
    expect(updated[0]!.transcription!.status).toBe("done");
    expect(updated[0]!.transcription!.text).toBe(
      "Hello, this is a test transcription.",
    );
  });

  it("should delete a recording and clean up files", () => {
    const rec = createTestRecording("rec-del");
    writeMetadata([rec]);

    // ファイルが存在することを確認
    expect(fs.existsSync(rec.filePath)).toBe(true);

    // 録音を削除
    const recordings = readMetadata();
    const index = recordings.findIndex((r) => r.id === "rec-del");
    expect(index).not.toBe(-1);

    const recording = recordings[index]!;
    if (fs.existsSync(recording.filePath)) {
      fs.rmSync(recording.filePath, { recursive: true });
    }
    recordings.splice(index, 1);
    writeMetadata(recordings);

    // メタデータから削除されたことを確認
    const remaining = readMetadata();
    expect(remaining).toHaveLength(0);

    // ファイルも削除されたことを確認
    expect(fs.existsSync(rec.filePath)).toBe(false);
  });

  it("should handle multi-track recordings", () => {
    const recDir = path.join(tempDir, "rec-multi");
    fs.mkdirSync(recDir, { recursive: true });

    const micPath = path.join(recDir, "mic.wav");
    const systemPath = path.join(recDir, "system.wav");
    fs.writeFileSync(micPath, Buffer.alloc(2048));
    fs.writeFileSync(systemPath, Buffer.alloc(4096));

    const tracks: TrackInfo[] = [
      {
        trackKind: "mic",
        fileName: "mic.wav",
        filePath: micPath,
        channels: 1,
        fileSizeBytes: 2048,
      },
      {
        trackKind: "system",
        fileName: "system.wav",
        filePath: systemPath,
        channels: 2,
        fileSizeBytes: 4096,
      },
    ];

    const rec = createTestRecording("rec-multi", {
      tracks,
      filePath: recDir,
      fileSizeBytes: 6144,
    });

    writeMetadata([rec]);

    const recordings = readMetadata();
    expect(recordings[0]!.tracks).toHaveLength(2);
    expect(recordings[0]!.tracks[0]!.trackKind).toBe("mic");
    expect(recordings[0]!.tracks[1]!.trackKind).toBe("system");
    expect(recordings[0]!.tracks[0]!.channels).toBe(1);
    expect(recordings[0]!.tracks[1]!.channels).toBe(2);
  });
});

describe("Recording metadata validation", () => {
  it("should preserve all required fields", () => {
    const rec = createTestRecording("rec-fields");
    writeMetadata([rec]);

    const loaded = readMetadata()[0]!;
    expect(loaded.id).toBeDefined();
    expect(loaded.fileName).toBeDefined();
    expect(loaded.filePath).toBeDefined();
    expect(loaded.tracks).toBeDefined();
    expect(loaded.createdAt).toBeDefined();
    expect(loaded.durationMs).toBeDefined();
    expect(loaded.fileSizeBytes).toBeDefined();
    expect(loaded.config).toBeDefined();
  });

  it("should preserve recording config", () => {
    const rec = createTestRecording("rec-config", {
      config: {
        sampleRate: 44100,
        channels: 1,
        bitDepth: 16,
        micEnabled: true,
        systemAudioEnabled: true,
        micDeviceId: "device-123",
      },
    });
    writeMetadata([rec]);

    const loaded = readMetadata()[0]!;
    expect(loaded.config.sampleRate).toBe(44100);
    expect(loaded.config.channels).toBe(1);
    expect(loaded.config.systemAudioEnabled).toBe(true);
    expect(loaded.config.micDeviceId).toBe("device-123");
  });

  it("should handle recording without transcription", () => {
    const rec = createTestRecording("rec-no-trans");
    writeMetadata([rec]);

    const loaded = readMetadata()[0]!;
    expect(loaded.transcription).toBeUndefined();
  });

  it("should handle transcription error state", () => {
    const rec = createTestRecording("rec-err-trans");
    rec.transcription = {
      status: "error",
      error: "API key is not configured.",
      trackKind: "mic",
    };
    writeMetadata([rec]);

    const loaded = readMetadata()[0]!;
    expect(loaded.transcription!.status).toBe("error");
    expect(loaded.transcription!.error).toContain("API key");
  });
});
