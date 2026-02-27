import { Effect } from "effect";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  APP_DATA_DIR,
  CONFIG_FILE,
  DEFAULT_SAMPLE_RATE,
  DEFAULT_BIT_DEPTH,
  DEFAULT_CHANNELS,
} from "../../shared/constants.js";
import { FileReadError, FileWriteError } from "../../shared/errors.js";
import type { RecordingConfig } from "../../shared/types.js";

const configPath = path.join(os.homedir(), APP_DATA_DIR, CONFIG_FILE);

const defaultConfig: RecordingConfig = {
  sampleRate: DEFAULT_SAMPLE_RATE,
  channels: DEFAULT_CHANNELS,
  bitDepth: DEFAULT_BIT_DEPTH,
  micEnabled: true,
  systemAudioEnabled: false,
  micDeviceId: null,
};

export function load() {
  return Effect.tryPromise({
    try: async () => {
      if (!fs.existsSync(configPath)) {
        return defaultConfig;
      }
      const raw = fs.readFileSync(configPath, "utf-8");
      return JSON.parse(raw) as RecordingConfig;
    },
    catch: (error) =>
      new FileReadError({
        path: configPath,
        reason: String(error),
      }),
  });
}

export function save(config: RecordingConfig) {
  return Effect.tryPromise({
    try: async () => {
      const dir = path.dirname(configPath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    },
    catch: (error) =>
      new FileWriteError({
        path: configPath,
        reason: String(error),
      }),
  });
}
