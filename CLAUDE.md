# CLAUDE.md

Cross Recorder is a cross-platform desktop audio recorder built with [Electrobun](https://electrobun.dev) (Bun + CEF), React, and native audio capture. It records microphone and system audio simultaneously into separate WAV tracks. Features, supported platforms, and installation are in `README.md` — this file covers only what an agent needs to work on the codebase.

## Commands

```bash
pnpm install

pnpm dev            # Electrobun dev with watch mode
pnpm dev:hmr         # Vite HMR + Electrobun (concurrent)

pnpm build:vite      # Vite build only (fast, used for verifying changes compile)
pnpm build           # Full production build (native build + Vite + Electrobun package)

pnpm test            # Vitest, run under Bun (needed for the Bun.spawn-based native service tests)
pnpm test:bats       # bats tests for src/native/linux/capture-system-audio.sh (needs bats-core)
pnpm lint            # oxlint (config: oxlint.config.mjs)
pnpm lint:shell      # ShellCheck for src/native/linux/*.sh and scripts/build-native.sh (needs shellcheck)
pnpm typecheck       # tsc --noEmit
```

`pnpm build` requires platform-native toolchains (Xcode Command Line Tools on macOS) and is normally only run in CI (`.github/workflows/build-check.yml`, macOS/Windows runners). Verify changes with `pnpm build:vite` locally instead.

## Architecture

```
src/
├── bun/          # Main process (Bun runtime): RecordingManager, FileService, UpdateService, typed RPC handlers (rpc.ts)
├── mainview/     # Renderer (CEF / React): audio capture/playback, views, Zustand stores, components
├── shared/       # Types, RPC schema, errors, constants shared between bun and mainview
├── native/       # Platform-specific code (macos/: ScreenCaptureKit Swift binary)
├── lint/         # Custom oxlint plugin (Effect TS rules, see oxlint.config.mjs)
└── e2e/          # End-to-end tests
```

Recording flow: `getUserMedia`/`getDisplayMedia` (or ScreenCaptureKit on macOS) capture audio → an AudioWorklet extracts PCM in real time → PCM is base64-encoded over RPC to the Bun main process → `ChunkWriter` appends it to WAV files, updating headers periodically so an in-progress recording survives a crash.

Error handling follows `.claude/rules/error-handling.md` (Effect TS); `no-throw-literal`/`eqeqeq` and other lint rules are enforced project-wide via `oxlint.config.mjs`, with narrow per-directory overrides for template-synced tooling under `tools/agent-fleet/`.

## Agent workflow

`.claude/rules/` holds the behavioral rules referenced from `AGENTS.md`; `.claude/skills/` holds task skills. Both are kept in sync with a shared template via `npx ziku pull` (`.ziku/ziku.jsonc` lists the synced paths) — don't hand-edit synced files' content beyond what `template-sync-boundary.md` allows, since local edits get flagged as drift on the next pull. `.claude/rules/project/` is this repository's own, not synced — repo-specific rules belong there instead.
