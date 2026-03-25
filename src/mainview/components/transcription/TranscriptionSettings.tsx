import { useCallback, useEffect, useState } from "react";
import { Button } from "../ui/button.js";
import { Switch } from "../ui/switch.js";
import { useRpc } from "../../hooks/useRpc.js";
import type { TranscriptionConfig } from "@shared/types.js";

/**
 * 文字起こし設定パネル。
 *
 * 背景: 文字起こしエンジンの選択と API 設定を管理する。
 * macOS ではネイティブ (Speech.framework) とAPI (Whisper) を切り替え可能。
 * ネイティブが利用不可のプラットフォームでは API 設定のみ表示。
 * 設定はバックエンドの transcription-config.json に永続化される。
 *
 * 呼び出し元: ExpandedPlayer（設定ボタンから表示）
 */
type Props = {
  onClose: () => void;
};

export function TranscriptionSettings({ onClose }: Props) {
  const { request } = useRpc();
  const [config, setConfig] = useState<TranscriptionConfig>({
    apiKey: "",
    apiBaseUrl: "https://api.openai.com/v1",
    model: "whisper-1",
    language: "ja",
    useNative: true,
  });
  const [nativeAvailable, setNativeAvailable] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    request
      .getTranscriptionConfig({})
      .then((res) => {
        const { nativeAvailable: available, ...configValues } = res;
        setConfig(configValues);
        setNativeAvailable(available);
      })
      .catch((err) => {
        console.error("Failed to load transcription config:", err);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await request.setTranscriptionConfig(config);
      onClose();
    } catch (err) {
      console.error("Failed to save transcription config:", err);
    } finally {
      setSaving(false);
    }
  }, [config, onClose, request]);

  const showApiSettings = !config.useNative || !nativeAvailable;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Transcription Settings
      </h3>

      {/* ネイティブ文字起こし切り替え（macOS のみ表示） */}
      {nativeAvailable && (
        <div className="flex items-center justify-between rounded-md border border-border bg-card/50 px-3 py-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-card-foreground">
              Native (macOS)
            </span>
            <span className="text-[11px] text-muted-foreground">
              API key not required, works offline
            </span>
          </div>
          <Switch
            checked={config.useNative}
            onCheckedChange={(checked) =>
              setConfig((c) => ({ ...c, useNative: checked }))
            }
          />
        </div>
      )}

      {/* API 設定（ネイティブ無効時 or 非 macOS で表示） */}
      {showApiSettings && (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">API Key</span>
            <input
              type="password"
              value={config.apiKey}
              onChange={(e) =>
                setConfig((c) => ({ ...c, apiKey: e.target.value }))
              }
              placeholder="sk-..."
              className="rounded-md border border-border bg-card px-2 py-1.5 text-xs text-card-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">API Base URL</span>
            <input
              type="text"
              value={config.apiBaseUrl}
              onChange={(e) =>
                setConfig((c) => ({ ...c, apiBaseUrl: e.target.value }))
              }
              className="rounded-md border border-border bg-card px-2 py-1.5 text-xs text-card-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </label>

          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs text-muted-foreground">Model</span>
            <input
              type="text"
              value={config.model}
              onChange={(e) =>
                setConfig((c) => ({ ...c, model: e.target.value }))
              }
              className="rounded-md border border-border bg-card px-2 py-1.5 text-xs text-card-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </label>
        </>
      )}

      <label className="flex w-20 flex-col gap-1">
        <span className="text-xs text-muted-foreground">Language</span>
        <input
          type="text"
          value={config.language}
          onChange={(e) =>
            setConfig((c) => ({ ...c, language: e.target.value }))
          }
          placeholder="ja"
          className="rounded-md border border-border bg-card px-2 py-1.5 text-xs text-card-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </label>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
