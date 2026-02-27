import { useRecordingStore } from "../stores/recordingStore.js";
import { useRecording } from "../hooks/useRecording.js";

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(1)} KB`;
}

export function RecordPanel() {
  const { recordingState, startRecording, stopRecording } = useRecording();
  const elapsedMs = useRecordingStore((s) => s.elapsedMs);
  const fileSizeBytes = useRecordingStore((s) => s.fileSizeBytes);
  const micEnabled = useRecordingStore((s) => s.micEnabled);
  const systemAudioEnabled = useRecordingStore((s) => s.systemAudioEnabled);

  const canRecord = micEnabled || systemAudioEnabled;

  const handleClick = () => {
    if (recordingState === "idle") {
      startRecording();
    } else if (recordingState === "recording") {
      stopRecording();
    }
  };

  return (
    <div className="flex flex-col items-center justify-center rounded-lg bg-gray-800 p-6">
      {/* Recording indicator */}
      {recordingState === "recording" && (
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
          <span className="text-xs font-medium uppercase tracking-wider text-red-400">
            Recording
          </span>
        </div>
      )}

      {/* Timer */}
      <div className="mb-4 font-mono text-4xl tabular-nums text-white">
        {formatTime(elapsedMs)}
      </div>

      {/* File size */}
      <div className="mb-6 text-sm text-gray-400">
        {formatFileSize(fileSizeBytes)}
      </div>

      {/* Record / Stop button */}
      <button
        type="button"
        onClick={handleClick}
        disabled={recordingState === "stopping" || !canRecord}
        className={`flex items-center justify-center transition-all duration-200 ${
          recordingState === "idle"
            ? "h-20 w-20 rounded-full bg-red-500 text-white hover:bg-red-600 active:scale-95"
            : recordingState === "recording"
              ? "h-20 w-20 animate-pulse rounded-2xl bg-red-500 text-white hover:bg-red-600 active:scale-95"
              : "h-20 w-20 cursor-not-allowed rounded-2xl bg-gray-600 text-gray-400"
        } ${!canRecord && recordingState === "idle" ? "cursor-not-allowed opacity-50" : ""}`}
      >
        {recordingState === "idle" && (
          <span className="text-3xl leading-none">{"\u25CF"}</span>
        )}
        {recordingState === "recording" && (
          <span className="text-2xl leading-none">{"\u25A0"}</span>
        )}
        {recordingState === "stopping" && (
          <svg
            className="h-8 w-8 animate-spin"
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
        )}
      </button>

      {/* Hint */}
      {!canRecord && recordingState === "idle" && (
        <p className="mt-3 text-xs text-gray-500">
          Enable at least one audio source
        </p>
      )}
    </div>
  );
}
