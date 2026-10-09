#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
GATE="$SCRIPT_DIR/release-gate.sh"
VALID_SHA=0123456789abcdef0123456789abcdef01234567
expect_pass() {
  if ! bash "$GATE" "$@" >/dev/null; then
    echo "FAIL: expected gate to pass: $*" >&2
    exit 1
  fi
}
expect_fail() {
  if bash "$GATE" "$@" >/dev/null 2>&1; then
    echo "FAIL: expected gate to refuse: $*" >&2
    exit 1
  fi
}
expect_pass candidate "$VALID_SHA" "$VALID_SHA"
expect_fail candidate 0123456789abcdef0123456789abcdef01234568 "$VALID_SHA"
expect_fail candidate "$VALID_SHA" 0123456789abcdef0123456789abcdef0123456
expect_fail production "$VALID_SHA" "$VALID_SHA"
expect_fail preview "$VALID_SHA" "$VALID_SHA"
expect_fail 'candidate; echo unsafe' "$VALID_SHA" "$VALID_SHA"
echo "PASS: gate allows only exact-SHA candidate packaging; all deployment targets are refused."
