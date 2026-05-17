#!/bin/sh
set -eu

main() {
  repo="${SOMA_REPO:-stephane-segning/soma}"
  bundle_tag="${SOMA_BUNDLE_TAG:-}"
  api_url="https://api.github.com/repos/${repo}/releases?per_page=100"

  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT

  if [ -z "$bundle_tag" ]; then
    curl -fsSL \
      -H "Accept: application/vnd.github+json" \
      "$api_url" \
      -o "$tmp/releases.json"
    bundle_tag="$(awk -F'"' '/"tag_name": "bundle-/ { print $4; exit }' "$tmp/releases.json")"
  fi

  if [ -z "$bundle_tag" ]; then
    echo "Could not find a bundle-* release for ${repo}." >&2
    echo "Set SOMA_BUNDLE_TAG=bundle-... to uninstall a specific bundle." >&2
    exit 1
  fi

  if ! command -v bash >/dev/null 2>&1; then
    echo "bash is required to run the Soma release uninstaller." >&2
    exit 1
  fi

  uninstaller_url="https://github.com/${repo}/releases/download/${bundle_tag}/uninstall.sh"
  echo "Uninstalling Soma using ${bundle_tag}"
  curl -fsSL "$uninstaller_url" -o "$tmp/uninstall.sh"
  bash "$tmp/uninstall.sh"
}

main "$@"
