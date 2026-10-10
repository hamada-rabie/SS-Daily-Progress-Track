#!/usr/bin/env bash
# Copies ONLY the files the live app needs into ./dist (no backups, rules, tests, demos).
set -euo pipefail
OUT="${1:-dist}"
FILES=(index.html login.html admin.html english_dashboard-dynamic.html practice.html remediation-validation.js manifest.json firebase-messaging-sw.js favicon.svg icon-192.svg icon-512.svg app-icon-192.svg app-icon-512.svg)
rm -rf "$OUT"; mkdir -p "$OUT"
for f in "${FILES[@]}"; do
  if [ -f "$f" ]; then cp "$f" "$OUT/$f"; elif [ "$f" = practice.html ]; then echo "note: $f not in this ref (skipped)"; else echo "MISSING required file: $f" >&2; exit 1; fi
done
echo "built $OUT: $(ls "$OUT" | wc -l) files"
