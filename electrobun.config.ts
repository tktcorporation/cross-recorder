import type { ElectrobunConfig } from "electrobun";
import pkg from "./package.json" with { type: "json" };

type ElectrobunConfigWithWatch = ElectrobunConfig & {
  build?: ElectrobunConfig["build"] & {
    watchIgnore?: string[];
  };
};

export default {
  app: {
    name: "Cross Recorder",
    identifier: "dev.crossrecorder.app",
    version: pkg.version,
  },
  release: {
    baseUrl:
      "https://github.com/tktcorporation/cross-recorder/releases/latest/download",
  },
  runtime: {
    exitOnLastWindowClosed: true,
  },
  build: {
    bun: {
      entrypoint: "src/bun/index.ts",
    },
    copy: {
      "dist/index.html": "views/mainview/index.html",
      "dist/assets": "views/mainview/assets",
    },
    watchIgnore: ["dist/**"],
    mac: {
      bundleCEF: true,
      defaultRenderer: "cef",
    },
    linux: {
      bundleCEF: true,
    },
    win: {
      bundleCEF: true,
    },
  },
} satisfies ElectrobunConfigWithWatch;
