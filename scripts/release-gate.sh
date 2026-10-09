#!/usr/bin/env bash
# Usage: release-gate.sh candidate <confirm_sha> <resolved_sha>
# This gate authorizes packaging only; it does not authorize deployment.
set -euo pipefail
target="${1:-}"
confirm="${2:-}"
sha="${3:-}"

if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "REFUSED: resolved commit must be a full 40-character lowercase hexadecimal SHA." >&2
  exit 1
fi

if [[ "$target" != "candidate" ]]; then
  echo "REFUSED: this workflow may package candidates only; deployment is disabled." >&2
  exit 1
fi
if [[ ! "$confirm" =~ ^[0-9a-f]{40}$ || "$confirm" != "$sha" ]]; then
  echo "REFUSED: type the exact resolved commit SHA to package this candidate: $sha" >&2
  exit 1
fi
echo "OK: exact candidate SHA confirmed for packaging only: $sha"
