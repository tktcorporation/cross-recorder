import { useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { rpc } from "../rpc.js";
import { useUpdateStore } from "../stores/updateStore.js";

/**
 * アプリのアップデート状態を表示・操作するコンポーネント。
 *
 * 背景: Electrobun のアップデート機能と連携し、バージョン表示・確認・
 * ダウンロード・適用の UI を提供する。状態遷移時にフェードアニメーションを適用。
 *
 * 呼び出し元: App.tsx (フッター領域)
 */

/** 状態遷移時のフェードアニメーション設定 */
const fadeVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

const fadeTransition = { duration: 0.15 };

export function UpdateNotification() {
  const {
    updateStatus,
    progress,
    errorMessage,
    currentVersion,
    setCurrentVersion,
  } = useUpdateStore();

  const upToDateTimerRef = useRef<ReturnType<typeof setTimeout>>();

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

  useEffect(() => {
    return () => {
      if (upToDateTimerRef.current) clearTimeout(upToDateTimerRef.current);
    };
  }, []);

  const handleCheckForUpdate = useCallback(async () => {
    useUpdateStore.getState().setStatus("checking", "");
    try {
      const result = await rpc.request.checkForUpdate({});
      if (result.error) {
        useUpdateStore.getState().setStatus("error", result.error);
      } else if (!result.updateAvailable) {
        useUpdateStore.getState().setStatus("up-to-date", "");
        if (upToDateTimerRef.current) clearTimeout(upToDateTimerRef.current);
        upToDateTimerRef.current = setTimeout(() => {
          useUpdateStore.getState().reset();
        }, 3000);
      }
      // updateAvailable === true is handled by onStatusChange callback
    } catch (e) {
      useUpdateStore.getState().setStatus("error", String(e));
    }
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
    await handleCheckForUpdate();
  }, [handleCheckForUpdate]);

  const renderContent = () => {
    if (updateStatus === "idle") {
      return currentVersion ? (
        <motion.button
          key="idle"
          onClick={handleCheckForUpdate}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          title="アップデートを確認"
          {...fadeVariants}
          transition={fadeTransition}
        >
          v{currentVersion}
        </motion.button>
      ) : null;
    }

    if (updateStatus === "checking") {
      return (
        <motion.span
          key="checking"
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
          {...fadeVariants}
          transition={fadeTransition}
        >
          <svg
            className="h-3 w-3 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          確認中...
        </motion.span>
      );
    }

    if (updateStatus === "up-to-date") {
      return (
        <motion.span
          key="up-to-date"
          className="text-xs text-green-400"
          {...fadeVariants}
          transition={fadeTransition}
        >
          最新版です (v{currentVersion})
        </motion.span>
      );
    }

    if (updateStatus === "available") {
      return (
        <motion.button
          key="available"
          onClick={handleDownload}
          className="rounded bg-playback px-2 py-0.5 text-xs text-playback-foreground hover:bg-playback/90"
          {...fadeVariants}
          transition={fadeTransition}
        >
          更新あり
        </motion.button>
      );
    }

    if (updateStatus === "downloading") {
      return (
        <motion.div
          key="downloading"
          className="flex items-center gap-2"
          {...fadeVariants}
          transition={fadeTransition}
        >
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-playback transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {progress > 0 ? `${progress}%` : "ダウンロード中..."}
          </span>
        </motion.div>
      );
    }

    if (updateStatus === "ready") {
      return (
        <motion.button
          key="ready"
          onClick={handleApply}
          className="rounded bg-green-600 px-2 py-0.5 text-xs text-foreground hover:bg-green-500"
          {...fadeVariants}
          transition={fadeTransition}
        >
          再起動して更新
        </motion.button>
      );
    }

    if (updateStatus === "applying") {
      return (
        <motion.span
          key="applying"
          className="text-xs text-yellow-400"
          {...fadeVariants}
          transition={fadeTransition}
        >
          更新を適用中...
        </motion.span>
      );
    }

    if (updateStatus === "error") {
      return (
        <motion.div
          key="error"
          className="flex items-center gap-1"
          {...fadeVariants}
          transition={fadeTransition}
        >
          <span className="max-w-32 truncate text-xs text-destructive" title={errorMessage}>
            更新エラー
          </span>
          <button
            onClick={handleRetry}
            className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground hover:bg-secondary/80"
          >
            リトライ
          </button>
        </motion.div>
      );
    }

    return null;
  };

  return (
    <AnimatePresence mode="wait">
      {renderContent()}
    </AnimatePresence>
  );
}
