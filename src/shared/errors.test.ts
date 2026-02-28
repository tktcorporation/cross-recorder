import { describe, it, expect } from "vitest";
import {
  UpdateCheckError,
  UpdateDownloadError,
  UpdateApplyError,
  ShellCommandError,
} from "./errors.js";

describe("Error types", () => {
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
