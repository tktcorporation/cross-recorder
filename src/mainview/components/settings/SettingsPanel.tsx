import { useCallback, useEffect, useState } from "react";
import { Button } from "../ui/button.js";
import { Switch } from "../ui/switch.js";
import { useRpc } from "../../hooks/useRpc.js";
import type { TranscriptionConfig } from "@shared/types.js";

/**
 * アプリ設定パネル。サイドバーヘッダーの歯車アイコンから展開される。
 *
 * 背景: 文字起こし設定（API キー、モデル等）をサイドバー内の専用パネルで管理する。
 * 以前は ExpandedPlayer 内にインラインで表示していたが、
 * 録音に紐づかないアプリ全体の設定であるため独立パネルに移動した。
 *
 * 呼び出し元: LibrarySidebar（設定ボタンから表示）
 */
type Props = {
  onClose: () => void;
};

export function SettingsPanel({ onClose }: Props) {
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
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/80">
        Transcription
      </h3>

      {/* ネイティブ文字起こし切り替え（macOS のみ表示） */}
      {nativeAvailable && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-foreground">
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
              className="rounded-lg border border-border bg-background px-2.5 py-2 text-xs text-foreground transition-colors placeholder:text-muted-foreground/50 hover:border-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              className="rounded-lg border border-border bg-background px-2.5 py-2 text-xs text-foreground transition-colors placeholder:text-muted-foreground/50 hover:border-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Model</span>
            <input
              type="text"
              value={config.model}
              onChange={(e) =>
                setConfig((c) => ({ ...c, model: e.target.value }))
              }
              className="rounded-lg border border-border bg-background px-2.5 py-2 text-xs text-foreground transition-colors placeholder:text-muted-foreground/50 hover:border-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          className="rounded-lg border border-border bg-background px-2.5 py-2 text-xs text-foreground transition-colors placeholder:text-muted-foreground/50 hover:border-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
