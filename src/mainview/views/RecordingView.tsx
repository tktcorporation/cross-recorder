import { useViewStore } from "../stores/viewStore.js";

/**
 * 録音画面のプレースホルダー。
 * Task 4-5 で RecordButton, PulseRings, AudioSourceControls, RecordingWaveform を統合予定。
 */
export function RecordingView() {
  const setView = useViewStore((s) => s.setView);
  return (
    <div className="flex h-full flex-col items-center justify-center p-6">
      <p className="text-muted-foreground">Recording View (placeholder)</p>
      <button
        onClick={() => setView("library")}
        className="mt-4 text-sm text-playback transition-colors hover:text-foreground"
      >
        Open Library
      </button>
    </div>
  );
}
