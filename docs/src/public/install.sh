#!/usr/bin/env bash
set -euo pipefail

REPO="${SOMA_REPO:-stephane-segning/soma}"
BUNDLE_TAG="${SOMA_BUNDLE_TAG:-}"
API_URL="https://api.github.com/repos/${REPO}/releases?per_page=100"

if [ -z "$BUNDLE_TAG" ]; then
  BUNDLE_TAG="$(
    curl -fsSL \
      -H "Accept: application/vnd.github+json" \
      "$API_URL" |
      awk -F'"' '/"tag_name": "bundle-/ { print $4; exit }'
  )"
fi

if [ -z "$BUNDLE_TAG" ]; then
  echo "Could not find a bundle-* release for ${REPO}." >&2
  echo "Set SOMA_BUNDLE_TAG=bundle-... to install a specific bundle." >&2
  exit 1
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

installer_url="https://github.com/${REPO}/releases/download/${BUNDLE_TAG}/install.sh"
echo "Installing Soma from ${BUNDLE_TAG}"
curl -fsSL "$installer_url" -o "$tmp/install.sh"
bash "$tmp/install.sh"
