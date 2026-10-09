#!/usr/bin/env bash
# Usage: release-gate.sh <target preview|production> <confirm> <resolved_sha>
# Production requires confirm == the exact 40-char commit SHA being deployed.
set -euo pipefail
target="${1:-}"; confirm="${2:-}"; sha="${3:-}"
case "$sha" in [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]*) ;; *) echo "bad sha" >&2; exit 1;; esac
[ "${#sha}" -eq 40 ] || { echo "sha must be 40 chars" >&2; exit 1; }
case "$target" in
  preview) echo "ok: preview deploy of $sha" ;;
  production)
    [ "$confirm" = "$sha" ] || { echo "REFUSED: type the exact commit SHA ($sha) in 'confirm' to deploy to production" >&2; exit 1; }
    echo "ok: production deploy of $sha confirmed" ;;
  *) echo "target must be preview or production" >&2; exit 1 ;;
esac
