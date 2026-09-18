import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "src/shared"),
      "@audio": path.resolve(import.meta.dirname, "src/mainview/audio"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
