import { useRecordingStore } from "../stores/recordingStore.js";
import { useAudioDevices } from "../hooks/useAudioDevices.js";

export function SourcePanel() {
  const micEnabled = useRecordingStore((s) => s.micEnabled);
  const setMicEnabled = useRecordingStore((s) => s.setMicEnabled);
  const systemAudioEnabled = useRecordingStore((s) => s.systemAudioEnabled);
  const setSystemAudioEnabled = useRecordingStore(
    (s) => s.setSystemAudioEnabled,
  );
  const recordingState = useRecordingStore((s) => s.recordingState);

  const { devices, selectedMicId, setSelectedMicId } = useAudioDevices();

  const disabled = recordingState !== "idle";

  return (
    <div className="rounded-lg bg-gray-800 p-4">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
        Audio Sources
      </h2>

      {/* Microphone */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-white">
            <span>Microphone</span>
          </label>
          <button
            type="button"
            role="switch"
            aria-checked={micEnabled}
            disabled={disabled}
            onClick={() => setMicEnabled(!micEnabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
              micEnabled ? "bg-red-500" : "bg-gray-600"
            } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
                micEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {micEnabled && (
          <select
            value={selectedMicId ?? ""}
            onChange={(e) => setSelectedMicId(e.target.value || null)}
            disabled={disabled}
            className="mt-2 w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            {devices.length === 0 && (
              <option value="">No microphones found</option>
            )}
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* System Audio */}
      <div>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-white">
            <span>System Audio</span>
          </label>
          <button
            type="button"
            role="switch"
            aria-checked={systemAudioEnabled}
            disabled={disabled}
            onClick={() => setSystemAudioEnabled(!systemAudioEnabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
              systemAudioEnabled ? "bg-red-500" : "bg-gray-600"
            } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
                systemAudioEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {systemAudioEnabled && (
          <p className="mt-2 text-xs text-gray-500">
            Screen selection dialog will appear when recording starts
          </p>
        )}
      </div>
    </div>
  );
}
