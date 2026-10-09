#!/usr/bin/env bash
# Usage: release-gate.sh <target> <confirm_sha> <resolved_sha>
set -euo pipefail
target="${1:-}"
confirm="${2:-}"
sha="${3:-}"

# Require exactly 40 lowercase hexadecimal characters (full Git commit SHA).
if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "REFUSED: resolved commit must be a full 40-character lowercase hexadecimal SHA." >&2
  exit 1
fi

case "$target" in
  production)
    if [[ ! "$confirm" =~ ^[0-9a-f]{40}$ || "$confirm" != "$sha" ]]; then
      echo "REFUSED: production requires typing the exact resolved commit SHA: $sha" >&2
      exit 1
    fi
    echo "OK: exact production commit SHA confirmed: $sha"
    ;;
  *)
    echo "REFUSED: unsupported deployment target '$target'. Only production is enabled." >&2
    exit 1
    ;;
esac
