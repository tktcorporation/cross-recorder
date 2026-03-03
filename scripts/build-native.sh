#!/usr/bin/env bash
# Build native helpers for the current platform.
# Currently only macOS is supported (ScreenCaptureKit system audio capture).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$PROJECT_ROOT/build/native"

mkdir -p "$OUTPUT_DIR"

if [[ "$(uname -s)" == "Darwin" ]]; then
  echo "Building macOS native system audio capture..."

  SWIFT_SRC="$PROJECT_ROOT/src/native/macos/capture-system-audio.swift"
  OUTPUT="$OUTPUT_DIR/capture-system-audio"

  swiftc \
    -O \
    -o "$OUTPUT" \
    -framework ScreenCaptureKit \
    -framework CoreMedia \
    -framework Foundation \
    "$SWIFT_SRC"

  chmod +x "$OUTPUT"
  echo "Built: $OUTPUT"
else
  echo "Skipping native build — not on macOS (system audio capture requires ScreenCaptureKit)"
fi
