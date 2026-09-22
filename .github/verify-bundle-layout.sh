#!/usr/bin/env bash
# TEMPORARY — delete before merging (see zz-verify-tauri-action.yml).
#
# Re-implements the *exact* lookup logic of release-desktop.yml's
# "Collect + rename bundles" step. If this passes, the real collect step
# will find the same files; if the action bump moved bundles, this fails
# loudly instead of silently shipping a release with missing assets.
#
# usage: verify-bundle-layout.sh <rust-triple> <ext>...
#        ext "app" means "the macOS .app directory" (what the real step
#        feeds to ditto to produce the .zip asset).
set -euo pipefail

RUST_TARGET="$1"; shift

BUNDLE_ROOTS=(
  "$GITHUB_WORKSPACE/target/${RUST_TARGET}/release/bundle"
  "$GITHUB_WORKSPACE/desktop/desktop-app/src-tauri/target/${RUST_TARGET}/release/bundle"
)

echo "== bundle roots that exist =="
for root in "${BUNDLE_ROOTS[@]}"; do
  if [ -d "$root" ]; then echo "  PRESENT $root"; else echo "  absent  $root"; fi
done

echo "== everything under the bundle roots =="
for root in "${BUNDLE_ROOTS[@]}"; do
  [ -d "$root" ] || continue
  find "$root" -maxdepth 2 -mindepth 1 | sort | sed 's/^/  /'
done

find_one() {
  local pat="$1" hit=""
  for root in "${BUNDLE_ROOTS[@]}"; do
    [ -d "$root" ] || continue
    hit="$(find "$root" -type f -name "$pat" ! -name '*.sig' -print 2>/dev/null | head -n 1)"
    [ -n "$hit" ] && { printf '%s' "$hit"; return 0; }
  done
  return 1
}

find_app() {
  local hit=""
  for root in "${BUNDLE_ROOTS[@]}"; do
    [ -d "$root" ] || continue
    hit="$(find "$root/macos" -maxdepth 1 -type d -name '*.app' -print 2>/dev/null | head -n 1)"
    [ -n "$hit" ] && { printf '%s' "$hit"; return 0; }
  done
  return 1
}

echo "== resolving each artifact the release expects =="
rc=0
for ext in "$@"; do
  if [ "$ext" = "app" ]; then
    if HIT="$(find_app)"; then echo "  OK   .app  -> $HIT"; else echo "  FAIL .app  -> not found"; rc=1; fi
  else
    if HIT="$(find_one "*.${ext}")"; then echo "  OK   .${ext} -> $HIT"; else echo "  FAIL .${ext} -> not found"; rc=1; fi
  fi
done
exit "$rc"
