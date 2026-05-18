#!/bin/sh
# Soma installer entry point.
#
# Tiny wrapper around bootstrap.sh — fetches and executes the install.sh
# shipped with the latest (or pinned) desktop-v* GitHub Release.
#
# Usage:
#   curl -fsSL https://soma.camer.digital/install.sh | sh
#   SOMA_DESKTOP_TAG=desktop-v1.2.3 curl -fsSL https://soma.camer.digital/install.sh | sh

set -eu

# shellcheck disable=SC1007  # CDPATH= is intentional (env var for the cd subcommand).
self_dir="$(CDPATH= cd -- "$(dirname -- "$0")" 2>/dev/null && pwd || true)"
bootstrap_local="${self_dir:+${self_dir}/bootstrap.sh}"
bootstrap_url="https://soma.camer.digital/bootstrap.sh"

if [ -n "${bootstrap_local:-}" ] && [ -f "$bootstrap_local" ]; then
  exec sh "$bootstrap_local" install
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required." >&2
  exit 1
fi

tmp="$(mktemp -d 2>/dev/null || mktemp -d -t soma-install)"
trap 'rm -rf "$tmp"' EXIT INT HUP TERM

curl -fsSL "$bootstrap_url" -o "$tmp/bootstrap.sh"
exec sh "$tmp/bootstrap.sh" install
