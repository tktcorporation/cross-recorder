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
    <div className="flex flex-col gap-3 rounded-lg border border-border/50 bg-card/30 px-4 py-3">
      {/* マイク行 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {/* マイクアイコン — 視覚的にソース種別を即座に識別できるようにする */}
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted-foreground">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
          <label
            htmlFor="mic-switch"
            className="text-sm font-medium text-foreground"
          >
            Mic
          </label>
          <Badge variant="secondary" className="text-[10px]">Mono</Badge>
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

      {/* 区切り線 */}
      <div className="border-t border-border/30" />

      {/* システム音声行 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {/* スピーカーアイコン */}
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted-foreground">
            <path d="M2 10v3" />
            <path d="M6 6v11" />
            <path d="M10 3v18" />
            <path d="M14 8v7" />
            <path d="M18 5v13" />
            <path d="M22 10v3" />
          </svg>
          <label
            htmlFor="system-audio-switch"
            className="text-sm font-medium text-foreground"
          >
            System Audio
          </label>
          <Badge variant="secondary" className="text-[10px]">Stereo</Badge>
        </div>
        <Switch
          id="system-audio-switch"
          checked={systemAudioEnabled}
          onCheckedChange={setSystemAudioEnabled}
          disabled={disabled}
        />
      </div>

      {/* 警告メッセージ — 両方無効の場合、背景色で目立たせる */}
      {noSourceSelected && (
        <p className="rounded-md bg-muted/50 py-1.5 text-center text-[11px] text-muted-foreground">
          Enable at least one source to record
        </p>
      )}
    </div>
  );
}
