import { useCallback, useEffect, useState } from "react";
import { Button } from "../ui/button.js";
import { useRpc } from "../../hooks/useRpc.js";
import type { TranscriptionConfig } from "@shared/types.js";

/**
 * 文字起こし API 設定パネル。
 *
 * 背景: OpenAI Whisper API（互換サービス含む）の接続設定を管理する。
 * API キー・エンドポイント URL・モデル名・言語を設定できる。
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
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    request
      .getTranscriptionConfig({})
      .then((res) => {
        setConfig(res);
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

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Transcription Settings
      </h3>

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

      <div className="flex gap-2">
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
      </div>

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
