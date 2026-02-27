import { useEffect } from "react";
import { useRecordingStore } from "../stores/recordingStore.js";
import { useRpc } from "../hooks/useRpc.js";
import { RecordingItem } from "./RecordingItem.js";

export function RecordingsList() {
  const recordings = useRecordingStore((s) => s.recordings);
  const setRecordings = useRecordingStore((s) => s.setRecordings);
  const { request } = useRpc();

  useEffect(() => {
    request
      .getRecordings({})
      .then((list) => setRecordings(list))
      .catch((err) => console.error("Failed to load recordings:", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-lg bg-gray-800 p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
          Recordings
        </h2>
        {recordings.length > 0 && (
          <span className="rounded-full bg-gray-700 px-2 py-0.5 text-xs text-gray-300">
            {recordings.length}
          </span>
        )}
      </div>

      {recordings.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">
          No recordings yet
        </p>
      ) : (
        <div className="max-h-96 space-y-1 overflow-y-auto">
          {recordings.map((r) => (
            <RecordingItem key={r.id} recording={r} />
          ))}
        </div>
      )}
    </div>
  );
}
