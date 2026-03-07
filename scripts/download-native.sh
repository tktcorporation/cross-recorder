#!/usr/bin/env bash
# Download pre-built native binary from GitHub Releases.
#
# macOS 上でなくても開発できるよう、CI でビルド済みのバイナリを取得する。
# macOS 上であれば build-native.sh で直接ビルドする方が確実。
# 必要条件: gh CLI がインストールされ認証済みであること。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$PROJECT_ROOT/build/native"
BINARY_NAME="capture-system-audio"
RELEASE_TAG="native-bin-latest"

# macOS 上なら直接ビルドを推奨
if [[ "$(uname -s)" == "Darwin" ]]; then
  echo "macOS detected — building native binary locally instead of downloading."
  exec bash "$SCRIPT_DIR/build-native.sh"
fi

# gh CLI の存在チェック
if ! command -v gh &> /dev/null; then
  echo "Error: gh CLI is not installed. Install it from https://cli.github.com/"
  exit 1
fi

# gh の認証チェック
if ! gh auth status &> /dev/null 2>&1; then
  echo "Error: gh CLI is not authenticated. Run 'gh auth login' first."
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

echo "Downloading pre-built native binary from release '$RELEASE_TAG'..."
gh release download "$RELEASE_TAG" \
  --pattern "$BINARY_NAME" \
  --dir "$OUTPUT_DIR" \
  --clobber

chmod +x "$OUTPUT_DIR/$BINARY_NAME"
echo "Downloaded: $OUTPUT_DIR/$BINARY_NAME"
echo ""
echo "Note: This binary is built for macOS (arm64). It will only work on macOS."
echo "On other platforms, system audio capture will fall back to getDisplayMedia."
