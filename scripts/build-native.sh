#!/usr/bin/env bash
# Build native helpers for the current platform.
# - macOS: ScreenCaptureKit system audio capture (Swift → compiled binary)
# - Linux: PipeWire/PulseAudio capture script (shell script → copy)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$PROJECT_ROOT/build/native"

mkdir -p "$OUTPUT_DIR"

case "$(uname -s)" in
  Darwin)
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
    ;;

  Linux)
    echo "Installing Linux native system audio capture script..."

    SCRIPT_SRC="$PROJECT_ROOT/src/native/linux/capture-system-audio.sh"
    OUTPUT="$OUTPUT_DIR/capture-system-audio.sh"

    cp "$SCRIPT_SRC" "$OUTPUT"
    chmod +x "$OUTPUT"
    echo "Installed: $OUTPUT"
    ;;

  *)
    echo "Skipping native build — unsupported platform: $(uname -s)"
    ;;
esac
