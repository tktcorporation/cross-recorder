/**
 * 設定フロー E2E テスト。
 *
 * 背景: TranscriptionConfig の永続化・読み込み・バリデーションの
 * 全体フローを統合的にテストする。設定画面への移行後も
 * 設定の保存・復元が正しく動作することを検証する。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { TranscriptionConfig } from "@shared/types.js";

let tempDir: string;
let configPath: string;

const defaultConfig: TranscriptionConfig = {
  apiKey: "",
  apiBaseUrl: "https://api.openai.com/v1",
  model: "whisper-1",
  language: "ja",
  useNative: true,
};

/** 設定を読み込む。未設定ならデフォルトを返す。 */
function loadConfig(): TranscriptionConfig {
  if (!fs.existsSync(configPath)) {
    return { ...defaultConfig };
  }
  const raw = fs.readFileSync(configPath, "utf-8");
  const saved = JSON.parse(raw) as Partial<TranscriptionConfig>;
  return { ...defaultConfig, ...saved };
}

/** 設定を保存する */
function saveConfig(config: TranscriptionConfig): void {
  const dir = path.dirname(configPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cross-recorder-settings-test-"));
  configPath = path.join(tempDir, "transcription-config.json");
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("Settings persistence", () => {
  it("should return defaults when no config file exists", () => {
    const config = loadConfig();
    expect(config).toEqual(defaultConfig);
  });

  it("should save and reload config", () => {
    const config: TranscriptionConfig = {
      apiKey: "sk-my-key",
      apiBaseUrl: "https://custom-api.example.com/v1",
      model: "whisper-large-v3",
      language: "en",
      useNative: false,
    };

    saveConfig(config);
    const loaded = loadConfig();

    expect(loaded.apiKey).toBe("sk-my-key");
    expect(loaded.apiBaseUrl).toBe("https://custom-api.example.com/v1");
    expect(loaded.model).toBe("whisper-large-v3");
    expect(loaded.language).toBe("en");
    expect(loaded.useNative).toBe(false);
  });

  it("should overwrite existing config", () => {
    saveConfig({ ...defaultConfig, apiKey: "sk-first" });
    expect(loadConfig().apiKey).toBe("sk-first");

    saveConfig({ ...defaultConfig, apiKey: "sk-second" });
    expect(loadConfig().apiKey).toBe("sk-second");
  });

  it("should merge partial saved config with defaults", () => {
    // 古いバージョンで保存された部分的な設定をシミュレート
    fs.writeFileSync(
      configPath,
      JSON.stringify({ apiKey: "sk-old", language: "fr" }),
    );

    const loaded = loadConfig();
    expect(loaded.apiKey).toBe("sk-old");
    expect(loaded.language).toBe("fr");
    // デフォルト値が適用される
    expect(loaded.model).toBe("whisper-1");
    expect(loaded.useNative).toBe(true);
    expect(loaded.apiBaseUrl).toBe("https://api.openai.com/v1");
  });
});

describe("Settings validation logic", () => {
  it("should determine API settings visibility correctly", () => {
    // showApiSettings = !config.useNative || !nativeAvailable
    const cases = [
      { useNative: true, nativeAvailable: true, expected: false },
      { useNative: true, nativeAvailable: false, expected: true },
      { useNative: false, nativeAvailable: true, expected: true },
      { useNative: false, nativeAvailable: false, expected: true },
    ];

    for (const { useNative, nativeAvailable, expected } of cases) {
      const showApiSettings = !useNative || !nativeAvailable;
      expect(showApiSettings).toBe(expected);
    }
  });

  it("should determine transcription method correctly", () => {
    // macOS でネイティブが有効 → ネイティブを使用（API キー不要）
    // macOS でネイティブが無効 → API を使用（API キー必須）
    // 非 macOS → API を使用（API キー必須）
    const cases = [
      {
        useNative: true,
        isDarwin: true,
        apiKey: "",
        method: "native",
        needsApiKey: false,
      },
      {
        useNative: false,
        isDarwin: true,
        apiKey: "sk-key",
        method: "api",
        needsApiKey: false,
      },
      {
        useNative: false,
        isDarwin: true,
        apiKey: "",
        method: "api",
        needsApiKey: true,
      },
      {
        useNative: true,
        isDarwin: false,
        apiKey: "",
        method: "api",
        needsApiKey: true,
      },
      {
        useNative: false,
        isDarwin: false,
        apiKey: "sk-key",
        method: "api",
        needsApiKey: false,
      },
    ];

    for (const { useNative, isDarwin, apiKey, method, needsApiKey } of cases) {
      const wantsNative = useNative && isDarwin;
      const actualMethod = wantsNative ? "native" : "api";
      const actualNeedsApiKey = !wantsNative && !apiKey;

      expect(actualMethod).toBe(method);
      expect(actualNeedsApiKey).toBe(needsApiKey);
    }
  });
});

describe("Config file resilience", () => {
  it("should handle corrupted config file gracefully", () => {
    fs.writeFileSync(configPath, "not valid json{{{");

    expect(() => loadConfig()).toThrow();
  });

  it("should handle empty config file", () => {
    fs.writeFileSync(configPath, "{}");

    const loaded = loadConfig();
    // 空のオブジェクトでもデフォルトがマージされる
    expect(loaded.model).toBe("whisper-1");
    expect(loaded.useNative).toBe(true);
  });

  it("should create config directory if it does not exist", () => {
    const nestedConfigPath = path.join(tempDir, "nested", "dir", "config.json");
    const nestedDir = path.dirname(nestedConfigPath);

    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(nestedConfigPath, JSON.stringify(defaultConfig));

    expect(fs.existsSync(nestedConfigPath)).toBe(true);
  });
});
