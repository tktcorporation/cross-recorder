import { Updater } from "electrobun/bun";
import type { UpdateStatusEntry } from "electrobun/bun";
import type { UpdateStatus } from "../../shared/types.js";

type SendUpdateStatus = (payload: {
  status: UpdateStatus;
  message: string;
  progress?: number;
}) => void;

let sendToWebview: SendUpdateStatus | null = null;

function mapStatus(raw: UpdateStatusEntry["status"]): UpdateStatus {
  switch (raw) {
    case "checking":
      return "checking";
    case "update-available":
      return "available";
    case "download-starting":
    case "downloading":
    case "downloading-full-bundle":
    case "downloading-patch":
    case "download-progress":
    case "decompressing":
      return "downloading";
    case "download-complete":
      return "ready";
    case "applying":
    case "extracting":
    case "replacing-app":
    case "launching-new-version":
    case "complete":
      return "applying";
    case "error":
      return "error";
    default:
      return "idle";
  }
}

export function init(send: SendUpdateStatus) {
  sendToWebview = send;

  Updater.onStatusChange((entry: UpdateStatusEntry) => {
    if (!sendToWebview) return;

    const status = mapStatus(entry.status);
    const progress = entry.details?.progress;
    sendToWebview({
      status,
      message: entry.message,
      progress,
    });
  });

  // Auto-check for updates 5 seconds after startup
  setTimeout(async () => {
    try {
      await Updater.checkForUpdate();
    } catch (e) {
      console.error("[UpdateService] auto-check failed:", e);
    }
  }, 5000);
}

export async function checkForUpdate() {
  try {
    const result = await Updater.checkForUpdate();
    return {
      version: result.version || "",
      updateAvailable: result.updateAvailable || false,
      error: result.error || "",
    };
  } catch (e) {
    return {
      version: "",
      updateAvailable: false,
      error: String(e),
    };
  }
}

export async function downloadUpdate() {
  try {
    await Updater.downloadUpdate();
    const info = Updater.updateInfo();
    if (info?.error) {
      return { success: false, error: info.error };
    }
    return { success: true, error: "" };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function applyUpdate() {
  try {
    await Updater.applyUpdate();
    return { success: true, error: "" };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function getAppVersion() {
  try {
    const version = await Updater.localInfo.version();
    const channel = await Updater.localInfo.channel();
    return { version, channel };
  } catch {
    return { version: "unknown", channel: "dev" };
  }
}
