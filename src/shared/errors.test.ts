import { describe, it, expect } from "vitest";
import {
  FileWriteError,
  FileReadError,
  PermissionDeniedError,
  DeviceNotFoundError,
  RecordingNotFoundError,
  UpdateCheckError,
  UpdateDownloadError,
  UpdateApplyError,
  ShellCommandError,
} from "./errors.js";

describe("Error types", () => {
  it("FileWriteError has correct tag", () => {
    const err = new FileWriteError({ path: "/tmp/test.wav", reason: "disk full" });
    expect(err._tag).toBe("FileWriteError");
    expect(err.path).toBe("/tmp/test.wav");
    expect(err.reason).toBe("disk full");
  });

  it("FileReadError has correct tag", () => {
    const err = new FileReadError({ path: "/tmp/missing.wav", reason: "not found" });
    expect(err._tag).toBe("FileReadError");
    expect(err.path).toBe("/tmp/missing.wav");
    expect(err.reason).toBe("not found");
  });

  it("PermissionDeniedError has correct tag", () => {
    const err = new PermissionDeniedError({ resource: "microphone", reason: "user denied" });
    expect(err._tag).toBe("PermissionDeniedError");
    expect(err.resource).toBe("microphone");
    expect(err.reason).toBe("user denied");
  });

  it("DeviceNotFoundError has correct tag", () => {
    const err = new DeviceNotFoundError({ deviceId: "abc-123" });
    expect(err._tag).toBe("DeviceNotFoundError");
    expect(err.deviceId).toBe("abc-123");
  });

  it("RecordingNotFoundError has correct tag", () => {
    const err = new RecordingNotFoundError({ recordingId: "rec-456" });
    expect(err._tag).toBe("RecordingNotFoundError");
    expect(err.recordingId).toBe("rec-456");
  });

  it("UpdateCheckError has correct tag", () => {
    const err = new UpdateCheckError({ reason: "network" });
    expect(err._tag).toBe("UpdateCheckError");
    expect(err.reason).toBe("network");
  });

  it("UpdateDownloadError has correct tag", () => {
    const err = new UpdateDownloadError({ reason: "disk full" });
    expect(err._tag).toBe("UpdateDownloadError");
    expect(err.reason).toBe("disk full");
  });

  it("UpdateApplyError has correct tag", () => {
    const err = new UpdateApplyError({ reason: "permission" });
    expect(err._tag).toBe("UpdateApplyError");
    expect(err.reason).toBe("permission");
  });

  it("ShellCommandError has correct tag", () => {
    const err = new ShellCommandError({ command: "open", reason: "not found" });
    expect(err._tag).toBe("ShellCommandError");
    expect(err.command).toBe("open");
  });
});
