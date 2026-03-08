import { Switch } from "../ui/switch.js";
import { Badge } from "../ui/badge.js";
import { useAudioDevices } from "../../hooks/useAudioDevices.js";
import { useRecordingStore } from "../../stores/recordingStore.js";

/**
 * マイク・システム音声の有効/無効トグルとデバイス選択を提供するコントロール群。
 * 録音画面の下部に配置され、録音中は操作を無効化する。
 *
 * マイクが有効な場合のみデバイスセレクタを表示し、
 * チャンネル情報(Mono/Stereo)をバッジで表示する。
 */
type AudioSourceControlsProps = {
  disabled?: boolean;
};

export function AudioSourceControls({ disabled }: AudioSourceControlsProps) {
  const micEnabled = useRecordingStore((s) => s.micEnabled);
  const setMicEnabled = useRecordingStore((s) => s.setMicEnabled);
  const systemAudioEnabled = useRecordingStore((s) => s.systemAudioEnabled);
  const setSystemAudioEnabled = useRecordingStore(
    (s) => s.setSystemAudioEnabled,
  );
  const { devices, selectedMicId, setSelectedMicId } = useAudioDevices();

  const noSourceSelected = !micEnabled && !systemAudioEnabled;

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      {/* マイク行 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label
            htmlFor="mic-switch"
            className="text-sm font-medium text-foreground"
          >
            Mic
          </label>
          <Badge variant="secondary">Mono</Badge>
        </div>
        <Switch
          id="mic-switch"
          checked={micEnabled}
          onCheckedChange={setMicEnabled}
          disabled={disabled}
        />
      </div>

      {/* マイクデバイスセレクタ — マイク有効時のみ表示 */}
      {micEnabled && (
        <select
          value={selectedMicId ?? ""}
          onChange={(e) => setSelectedMicId(e.target.value || null)}
          disabled={disabled}
          className="w-full rounded-md border border-border bg-secondary px-3 py-1.5 text-xs text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          {devices.length === 0 && (
            <option value="">No devices found</option>
          )}
          {devices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `Microphone (${device.deviceId.slice(0, 8)})`}
            </option>
          ))}
        </select>
      )}

      {/* システム音声行 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label
            htmlFor="system-audio-switch"
            className="text-sm font-medium text-foreground"
          >
            System Audio
          </label>
          <Badge variant="secondary">Stereo</Badge>
        </div>
        <Switch
          id="system-audio-switch"
          checked={systemAudioEnabled}
          onCheckedChange={setSystemAudioEnabled}
          disabled={disabled}
        />
      </div>

      {/* 警告メッセージ — 両方無効の場合 */}
      {noSourceSelected && (
        <p className="text-center text-xs text-muted-foreground">
          Enable at least one audio source to start recording
        </p>
      )}
    </div>
  );
}
