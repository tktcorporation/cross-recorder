import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ command }) => ({
  plugins: [react()],
  root: "src/mainview",
  base: "./",
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "src/shared"),
      "@audio": path.resolve(__dirname, "src/mainview/audio"),
      "@": path.resolve(__dirname, "src/mainview"),
      // dev server 時のみ electrobun/view をモックに差し替え。
      // ブラウザでUI確認するためのもので、本番ビルドには影響しない。
      ...(command === "serve"
        ? {
            "electrobun/view": path.resolve(
              __dirname,
              "src/mainview/__mocks__/electrobun-view.ts",
            ),
          }
        : {}),
    },
  },
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    host: "0.0.0.0",
  },
}));
