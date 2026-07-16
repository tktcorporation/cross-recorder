import { describe, it, expect } from "vitest";
import { reconcileSelectedMic } from "./useAudioDevices.js";
import type { AudioDevice } from "@shared/types.js";

function device(deviceId: string, isDefault = false): AudioDevice {
  return { deviceId, label: deviceId, kind: "audioinput", isDefault };
}

describe("reconcileSelectedMic", () => {
  it("keeps the current selection when it still exists in the list, even if another device is the OS default", () => {
    const list = [device("a"), device("b", true)];
    expect(reconcileSelectedMic(list, "a")).toBe("a");
  });

  it("falls back to the default device when nothing is selected", () => {
    const list = [device("a"), device("b", true)];
    expect(reconcileSelectedMic(list, null)).toBe("b");
  });

  it("falls back to the first device when nothing is selected and no default exists", () => {
    const list = [device("a"), device("b")];
    expect(reconcileSelectedMic(list, null)).toBe("a");
  });

  it("falls back to the default device when the current selection no longer exists", () => {
    const list = [device("a"), device("b", true)];
    // "old-device" was unplugged; the previously selected id is stale.
    expect(reconcileSelectedMic(list, "old-device")).toBe("b");
  });

  it("leaves the current selection untouched when the device list is momentarily empty", () => {
    // devicechange can report an empty list transiently (OS re-scan,
    // unrelated USB device change) — must not treat this as "the mic
    // was removed" and silently switch the active device later.
    expect(reconcileSelectedMic([], "a")).toBe("a");
  });

  it("stays null when the device list is empty and nothing was selected", () => {
    expect(reconcileSelectedMic([], null)).toBeNull();
  });
});
