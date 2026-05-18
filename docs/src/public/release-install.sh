#!/usr/bin/env bash
# Soma release-shipped installer.
#
# Lives in the repo (reviewed in PR) and is copied as the `install.sh` asset
# of every desktop-v* GitHub Release. The bootstrap script downloads this
# file and execs it after SHA256 verification.
#
# Contract:
#   - No sudo, ever. Installs strictly into the user's home.
#   - macOS  -> ~/Applications/Soma.app
#   - Linux  -> ~/Applications/Soma.AppImage
#
# Environment:
#   SOMA_REPO         owner/name (default: stephane-segning/soma)
#   SOMA_DESKTOP_TAG  desktop-vX.Y.Z (default: latest desktop-v* release)
#
# Note on macOS Login Item registration: skipped intentionally in this
# iteration; the user can enable "Launch at login" from Soma settings.

set -euo pipefail

repo="${SOMA_REPO:-stephane-segning/soma}"
tag="${SOMA_DESKTOP_TAG:-}"

os_raw="$(uname -s)"
os="$(printf '%s' "$os_raw" | tr '[:upper:]' '[:lower:]')"
arch_raw="$(uname -m)"

case "$arch_raw" in
  arm64|aarch64) arch="arm64" ;;
  x86_64|amd64)  arch="amd64" ;;
  *)
    echo "Unsupported architecture: $arch_raw" >&2
    exit 1
    ;;
esac

case "$os" in
  darwin)
    if [ "$arch" != "arm64" ]; then
      echo "Soma macOS builds are Apple Silicon (arm64) only; detected '$arch_raw'." >&2
      exit 1
    fi
    asset_ext="zip"
    ;;
  linux)
    asset_ext="AppImage"
    ;;
  *)
    echo "Unsupported OS: $os_raw" >&2
    exit 1
    ;;
esac

for cmd in curl awk; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "$cmd is required." >&2
    exit 1
  fi
done

sha_cmd=""
if command -v sha256sum >/dev/null 2>&1; then
  sha_cmd="sha256sum"
elif command -v shasum >/dev/null 2>&1; then
  sha_cmd="shasum -a 256"
else
  echo "sha256sum or shasum is required." >&2
  exit 1
fi

if [ "$os" = "darwin" ] && ! command -v unzip >/dev/null 2>&1; then
  echo "unzip is required to install Soma on macOS." >&2
  exit 1
fi

tmp="$(mktemp -d 2>/dev/null || mktemp -d -t soma-install)"
trap 'rm -rf "$tmp"' EXIT INT HUP TERM

if [ -z "$tag" ]; then
  api_url="https://api.github.com/repos/${repo}/releases?per_page=100"
  curl -fsSL -H "Accept: application/vnd.github+json" "$api_url" -o "$tmp/releases.json" \
    || { echo "Failed to query releases from $api_url" >&2; exit 1; }
  # Field-based scan: split on `"`, look for the `tag_name` key (field i),
  # take the value 2 fields over, accept it if it starts with `desktop-v`.
  # Resilient to whitespace/minification.
  tag="$(awk -F'"' '{for(i=1;i<=NF;i++) if($i=="tag_name" && $(i+2) ~ /^desktop-v/) {print $(i+2); exit}}' "$tmp/releases.json" || true)"
fi

if [ -z "$tag" ]; then
  echo "Could not resolve a desktop-v* release for ${repo}." >&2
  exit 1
fi

version="${tag#desktop-v}"
# `uname -s` returns `Darwin` on macOS; the release workflow uses `macos` in
# asset names (matches the workflow's `matrix.os`). Map darwin → macos here so
# `https://.../soma-desktop-X.Y.Z-macos-arm64.zip` resolves correctly.
asset_os="$os"
if [ "$os" = "darwin" ]; then
  asset_os="macos"
fi
asset_name="soma-desktop-${version}-${asset_os}-${arch}.${asset_ext}"
base_url="https://github.com/${repo}/releases/download/${tag}"

echo "Installing Soma ${version} (${os}/${arch})..."

curl -fsSL "${base_url}/${asset_name}" -o "$tmp/${asset_name}" \
  || { echo "Failed to download ${base_url}/${asset_name}" >&2; exit 1; }

# SHA256 verification. Treat a missing SHA256SUMS.txt as a non-fatal warning
# so the installer can still run against pre-checksum releases — but newer
# releases (this iteration onward) always include one.
if curl -fsSL "${base_url}/SHA256SUMS.txt" -o "$tmp/SHA256SUMS.txt" 2>/dev/null; then
  expected="$(awk -v f="$asset_name" '$2 == f || $2 == "*"f { print $1; exit }' "$tmp/SHA256SUMS.txt" || true)"
  if [ -z "$expected" ]; then
    echo "Warning: ${asset_name} not listed in SHA256SUMS.txt; skipping verification." >&2
  else
    actual="$($sha_cmd "$tmp/${asset_name}" | awk '{print $1}')"
    if [ "$expected" != "$actual" ]; then
      echo "Checksum mismatch for ${asset_name}." >&2
      echo "  expected: ${expected}" >&2
      echo "  actual:   ${actual}" >&2
      exit 1
    fi
    echo "Checksum verified."
  fi
else
  echo "Warning: SHA256SUMS.txt not found for ${tag}; skipping verification." >&2
fi

install_root="${HOME}/Applications"
mkdir -p "$install_root"

if [ "$os" = "darwin" ]; then
  target="${install_root}/Soma.app"
  if [ -e "$target" ]; then
    echo "Removing existing ${target}..."
    rm -rf "$target"
  fi
  # The zip contains Soma.app at its root; unzip directly into ~/Applications.
  unzip -o -q "$tmp/${asset_name}" -d "$install_root"
  if [ ! -d "$target" ]; then
    # Some packagers may nest the .app one level deep; recover by locating it.
    # `head -n 1` is portable; BSD find on macOS doesn't support `-quit`.
    found="$(find "$install_root" -maxdepth 3 -name 'Soma.app' -type d 2>/dev/null | head -n 1 || true)"
    if [ -n "$found" ] && [ "$found" != "$target" ]; then
      mv "$found" "$target"
    fi
  fi
  if [ ! -d "$target" ]; then
    echo "Install failed: Soma.app not found after unzip." >&2
    exit 1
  fi
  # No xattr strip needed: curl doesn't tag downloads with
  # com.apple.quarantine, and notarized binaries pass Gatekeeper on first
  # launch on their own.
  echo "Installed Soma at ${target}"
  echo "Launch from Finder, Spotlight, or: open '${target}'"
else
  target="${install_root}/Soma.AppImage"
  mv -f "$tmp/${asset_name}" "$target"
  chmod +x "$target"
  echo "Installed Soma at ${target}"
  echo "Launch with: '${target}'"
fi
