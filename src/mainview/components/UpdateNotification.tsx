import { useEffect, useCallback } from "react";
import { rpc } from "../rpc.js";
import { useUpdateStore } from "../stores/updateStore.js";

export function UpdateNotification() {
  const {
    updateStatus,
    progress,
    errorMessage,
    currentVersion,
    setCurrentVersion,
  } = useUpdateStore();

  useEffect(() => {
    rpc.request
      .getAppVersion({})
      .then(({ version, channel }) => setCurrentVersion(version, channel))
      .catch(() => {});
  }, [setCurrentVersion]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { status, message, progress } = (e as CustomEvent).detail;
      useUpdateStore.getState().setStatus(status, message, progress);
    };
    window.addEventListener("update-status", handler);
    return () => window.removeEventListener("update-status", handler);
  }, []);

  const handleDownload = useCallback(async () => {
    try {
      const result = await rpc.request.downloadUpdate({});
      if (!result.success) {
        useUpdateStore.getState().setStatus("error", result.error);
      }
    } catch (e) {
      useUpdateStore.getState().setStatus("error", String(e));
    }
  }, []);

  const handleApply = useCallback(async () => {
    try {
      await rpc.request.applyUpdate({});
    } catch (e) {
      useUpdateStore.getState().setStatus("error", String(e));
    }
  }, []);

  const handleRetry = useCallback(async () => {
    useUpdateStore.getState().reset();
    try {
      await rpc.request.checkForUpdate({});
    } catch (e) {
      useUpdateStore.getState().setStatus("error", String(e));
    }
  }, []);

  if (updateStatus === "idle" || updateStatus === "checking") {
    return currentVersion ? (
      <span className="text-xs text-gray-500">v{currentVersion}</span>
    ) : null;
  }

  if (updateStatus === "available") {
    return (
      <button
        onClick={handleDownload}
        className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white hover:bg-blue-500"
      >
        更新あり
      </button>
    );
  }

  if (updateStatus === "downloading") {
    return (
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-700">
          <div
            className="h-full rounded-full bg-blue-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-xs text-gray-400">
          {progress > 0 ? `${progress}%` : "ダウンロード中..."}
        </span>
      </div>
    );
  }

  if (updateStatus === "ready") {
    return (
      <button
        onClick={handleApply}
        className="rounded bg-green-600 px-2 py-0.5 text-xs text-white hover:bg-green-500"
      >
        再起動して更新
      </button>
    );
  }

  if (updateStatus === "applying") {
    return (
      <span className="text-xs text-yellow-400">更新を適用中...</span>
    );
  }

  if (updateStatus === "error") {
    return (
      <div className="flex items-center gap-1">
        <span className="max-w-32 truncate text-xs text-red-400" title={errorMessage}>
          更新エラー
        </span>
        <button
          onClick={handleRetry}
          className="rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-300 hover:bg-gray-600"
        >
          リトライ
        </button>
      </div>
    );
  }

  return null;
}
