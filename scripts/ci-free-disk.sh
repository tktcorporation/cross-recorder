#!/usr/bin/env bash
# Free disk space on CI macOS runners before building.
# Only runs when CI=true and on macOS; no-op otherwise.

set -euo pipefail

if [[ "${CI:-}" != "true" ]]; then
  exit 0
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  exit 0
fi

echo "=== Disk space before cleanup ==="
df -h /

# Remove Android SDK (~13GB on GitHub-hosted macOS runners)
sudo rm -rf /Users/runner/Library/Android/sdk 2>/dev/null || true

# Remove .NET SDK (~3GB)
sudo rm -rf /usr/local/share/dotnet 2>/dev/null || true

# Remove Haskell/GHC
sudo rm -rf /opt/ghc 2>/dev/null || true

# Remove cached Homebrew downloads
brew cleanup -s 2>/dev/null || true

echo "=== Disk space after cleanup ==="
df -h /
