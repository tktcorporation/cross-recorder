import { useViewStore } from "../stores/viewStore.js";

/**
 * ライブラリ画面のプレースホルダー。
 * Task 6-7 で RecordingCard, ExpandedPlayer を統合予定。
 */
export function LibraryView() {
  const setView = useViewStore((s) => s.setView);
  return (
    <div className="flex h-full flex-col items-center justify-center p-6">
      <p className="text-muted-foreground">Library View (placeholder)</p>
      <button
        onClick={() => setView("recording")}
        className="mt-4 text-sm text-playback transition-colors hover:text-foreground"
      >
        Back to Recording
      </button>
    </div>
  );
}
