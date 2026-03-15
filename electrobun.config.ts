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
      "build/native": "native",
    },
    watchIgnore: ["dist/**"],
    // CEF を削除しシステム WebView を使用:
    // macOS → WKWebView, Windows → WebView2, Linux → WebKitGTK
    // システム音声キャプチャはネイティブ実装で対応（ブラウザ API 不要）
  },
} satisfies ElectrobunConfigWithWatch;
