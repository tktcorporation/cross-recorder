import type { RecordingMetadata } from "@shared/types.js";
import { useRecordingStore } from "../stores/recordingStore.js";
import { useRpc } from "../hooks/useRpc.js";

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatFileSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(1)} KB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${y}/${mo}/${day} ${h}:${mi}`;
}

function trackLabel(trackKind: string, channels: number): string {
  const kind = trackKind === "mic" ? "Mic" : "System";
  const ch = channels === 1 ? "Mono" : "Stereo";
  return `${kind}(${ch})`;
}

type Props = {
  recording: RecordingMetadata;
};

export function RecordingItem({ recording }: Props) {
  const { request } = useRpc();
  const removeRecording = useRecordingStore((s) => s.removeRecording);
  const playingRecordingId = useRecordingStore((s) => s.playingRecordingId);
  const setPlayingRecordingId = useRecordingStore(
    (s) => s.setPlayingRecordingId,
  );

  const isPlaying = playingRecordingId === recording.id;

  const handlePlay = () => {
    setPlayingRecordingId(isPlaying ? null : recording.id);
  };

  const handleOpenFolder = async () => {
    await request.openFileLocation({ filePath: recording.filePath });
  };

  const handleDelete = async () => {
    await request.deleteRecording({ recordingId: recording.id });
    removeRecording(recording.id);
    if (isPlaying) {
      setPlayingRecordingId(null);
    }
  };

  const hasTracks = recording.tracks && recording.tracks.length > 0;

  return (
    <div className="flex items-center justify-between rounded-md px-3 py-2 transition-colors hover:bg-gray-700">
      {/* Left: Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">
          {recording.fileName}
        </p>
        <p className="mt-0.5 text-xs text-gray-400">
          {formatDate(recording.createdAt)}
          {" \u00B7 "}
          {formatDuration(recording.durationMs)}
          {" \u00B7 "}
          {formatFileSize(recording.fileSizeBytes)}
        </p>
        {hasTracks && (
          <div className="mt-1 flex gap-1.5">
            {recording.tracks.map((track) => (
              <span
                key={track.trackKind}
                className="rounded bg-gray-700 px-1.5 py-0.5 text-[10px] font-medium text-gray-300"
              >
                {trackLabel(track.trackKind, track.channels)}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Right: Actions */}
      <div className="ml-3 flex items-center gap-1">
        <button
          type="button"
          onClick={handlePlay}
          className={`rounded p-1.5 text-sm transition-colors hover:bg-gray-600 ${
            isPlaying ? "text-blue-400" : "text-gray-400 hover:text-white"
          }`}
          title={isPlaying ? "Stop" : "Play"}
        >
          {isPlaying ? "\u25A0" : "\u25B6"}
        </button>

        <button
          type="button"
          onClick={handleOpenFolder}
          className="rounded p-1.5 text-sm text-gray-400 transition-colors hover:bg-gray-600 hover:text-white"
          title="Open folder"
        >
          {"\uD83D\uDCC2"}
        </button>

        <button
          type="button"
          onClick={handleDelete}
          className="rounded p-1.5 text-sm text-gray-400 transition-colors hover:bg-gray-600 hover:text-red-400"
          title="Delete"
        >
          {"\u2715"}
        </button>
      </div>
    </div>
  );
}
