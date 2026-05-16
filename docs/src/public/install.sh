#!/usr/bin/env bash
set -euo pipefail

main() {
  local repo="${SOMA_REPO:-stephane-segning/soma}"
  local bundle_tag="${SOMA_BUNDLE_TAG:-}"
  local api_url="https://api.github.com/repos/${repo}/releases?per_page=100"

  if [ -z "$bundle_tag" ]; then
    bundle_tag="$(
      curl -fsSL \
        -H "Accept: application/vnd.github+json" \
        "$api_url" |
        awk -F'"' '/"tag_name": "bundle-/ { print $4; exit }'
    )"
  fi

  if [ -z "$bundle_tag" ]; then
    echo "Could not find a bundle-* release for ${repo}." >&2
    echo "Set SOMA_BUNDLE_TAG=bundle-... to install a specific bundle." >&2
    exit 1
  fi

  local tmp
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT

  local installer_url="https://github.com/${repo}/releases/download/${bundle_tag}/install.sh"
  echo "Installing Soma from ${bundle_tag}"
  curl -fsSL "$installer_url" -o "$tmp/install.sh"
  bash "$tmp/install.sh"
}

main "$@"
