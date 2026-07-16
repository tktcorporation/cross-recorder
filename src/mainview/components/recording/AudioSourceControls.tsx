import { Switch } from "../ui/switch.js";
import { ChevronDownIcon, MicIcon, SpeakerIcon } from "../ui/icons.js";
import { cn } from "@/lib/utils.js";
import { useAudioDevices } from "../../hooks/useAudioDevices.js";
import { useRecordingStore } from "../../stores/recordingStore.js";

/**
 * マイク・システム音声の有効/無効トグルとデバイス選択を提供するコントロール群。
 * 録音ステージ下部のドックに接地して配置され、録音中は操作を無効化する。
 *
 * 各ソースを行として表示し、有効時はアイコン・ラベルがアクセントカラーになる。
 * マイクが有効な場合のみデバイスセレクタを表示する。
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
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card/80 shadow-card backdrop-blur-sm transition-opacity",
        disabled && "opacity-60",
      )}
    >
      {/* マイク行 */}
      <div className="flex flex-col gap-2.5 px-3.5 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <SourceIcon active={micEnabled}>
              <MicIcon className="h-[18px] w-[18px]" />
            </SourceIcon>
            <div className="flex flex-col">
              <span
                className={cn(
                  "text-sm font-medium leading-tight transition-colors",
                  micEnabled ? "text-foreground" : "text-muted-foreground",
                )}
              >
                Microphone
              </span>
              <span className="text-[11px] leading-tight text-muted-foreground">
                Mono input
              </span>
            </div>
          </div>
          <Switch
            id="mic-switch"
            checked={micEnabled}
            onCheckedChange={setMicEnabled}
            disabled={disabled}
            aria-label="Microphone"
          />
        </div>

        {/* マイクデバイスセレクタ — マイク有効時のみ表示 */}
        {micEnabled && (
          <div className="relative">
            <select
              value={selectedMicId ?? ""}
              onChange={(e) => setSelectedMicId(e.target.value || null)}
              disabled={disabled}
              className="w-full appearance-none rounded-lg border border-border bg-background py-2 pl-3 pr-8 text-xs text-foreground transition-colors hover:border-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              {devices.length === 0 && (
                <option value="">No devices found</option>
              )}
              {devices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label ||
                    `Microphone (${device.deviceId.slice(0, 8)})`}
                </option>
              ))}
            </select>
            <ChevronDownIcon
              className={cn(
                "pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground transition-opacity",
                disabled && "opacity-50",
              )}
            />
          </div>
        )}
      </div>

      <div className="h-px bg-border/70" />

      {/* システム音声行 */}
      <div className="flex items-center justify-between gap-3 px-3.5 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <SourceIcon active={systemAudioEnabled}>
            <SpeakerIcon className="h-[18px] w-[18px]" />
          </SourceIcon>
          <div className="flex flex-col">
            <span
              className={cn(
                "text-sm font-medium leading-tight transition-colors",
                systemAudioEnabled ? "text-foreground" : "text-muted-foreground",
              )}
            >
              System Audio
            </span>
            <span className="text-[11px] leading-tight text-muted-foreground">
              Stereo output
            </span>
          </div>
        </div>
        <Switch
          id="system-audio-switch"
          checked={systemAudioEnabled}
          onCheckedChange={setSystemAudioEnabled}
          disabled={disabled}
          aria-label="System Audio"
        />
      </div>

      {/* 警告メッセージ — 両方無効の場合 */}
      {noSourceSelected && (
        <p className="border-t border-border/70 bg-elevated/30 px-3.5 py-2 text-center text-[11px] text-muted-foreground">
          Enable at least one source to start recording
        </p>
      )}
    </div>
  );
}

/** ソース行のアイコンを囲む丸タイル。有効時は青系のアクセントを帯びる。 */
function SourceIcon({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors",
        active
          ? "border-playback/40 bg-playback/15 text-playback"
          : "border-border bg-elevated/40 text-muted-foreground",
      )}
    >
      {children}
    </div>
  );
}
