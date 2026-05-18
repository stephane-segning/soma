#!/bin/sh
# Soma bootstrap helper.
#
# Resolves the latest (or pinned) desktop-v* GitHub Release, downloads the
# release-shipped install.sh / uninstall.sh script and its SHA256SUMS.txt,
# verifies the script's checksum, then execs it.
#
# Usage: bootstrap.sh install | uninstall
#
# Environment:
#   SOMA_REPO         owner/name (default: stephane-segning/soma)
#   SOMA_DESKTOP_TAG  pin a specific desktop-v* tag (default: latest)

set -eu

action="${1:-}"
case "$action" in
  install|uninstall) ;;
  *)
    echo "usage: $0 install|uninstall" >&2
    exit 2
    ;;
esac

repo="${SOMA_REPO:-stephane-segning/soma}"
tag="${SOMA_DESKTOP_TAG:-}"

os_raw="$(uname -s)"
os="$(printf '%s' "$os_raw" | tr '[:upper:]' '[:lower:]')"
arch="$(uname -m)"

case "$os" in
  darwin)
    case "$arch" in
      arm64|aarch64) ;;
      *)
        echo "Soma macOS builds are Apple Silicon (arm64) only; detected '$arch'." >&2
        exit 1
        ;;
    esac
    ;;
  linux)
    case "$arch" in
      x86_64|amd64|aarch64|arm64) ;;
      *)
        echo "Soma Linux builds support x86_64 and arm64; detected '$arch'." >&2
        exit 1
        ;;
    esac
    ;;
  *)
    echo "Unsupported OS: $os_raw" >&2
    exit 1
    ;;
esac

for cmd in curl awk sha256sum_or_shasum bash; do
  case "$cmd" in
    sha256sum_or_shasum)
      if ! command -v sha256sum >/dev/null 2>&1 && ! command -v shasum >/dev/null 2>&1; then
        echo "sha256sum or shasum is required." >&2
        exit 1
      fi
      ;;
    *)
      if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "$cmd is required." >&2
        exit 1
      fi
      ;;
  esac
done

tmp="$(mktemp -d 2>/dev/null || mktemp -d -t soma-bootstrap)"
trap 'rm -rf "$tmp"' EXIT INT HUP TERM

api_url="https://api.github.com/repos/${repo}/releases?per_page=100"

if [ -z "$tag" ]; then
  # Plain unauthenticated GitHub API call. We do not parse JSON deeply; the
  # tag_name field is enough to find the most recent desktop-v* release. The
  # list is returned newest-first.
  curl -fsSL -H "Accept: application/vnd.github+json" "$api_url" -o "$tmp/releases.json" \
    || { echo "Failed to query $api_url" >&2; exit 1; }
  tag="$(awk -F'"' '/"tag_name": "desktop-v/ { print $4; exit }' "$tmp/releases.json" || true)"
fi

if [ -z "$tag" ]; then
  echo "Could not find a desktop-v* release for ${repo}." >&2
  echo "Set SOMA_DESKTOP_TAG=desktop-vX.Y.Z to pin a specific version." >&2
  exit 1
fi

base_url="https://github.com/${repo}/releases/download/${tag}"
script_name="${action}.sh"

echo "Soma ${action}: ${tag} (${os}/${arch})"

curl -fsSL "${base_url}/${script_name}" -o "$tmp/${script_name}" \
  || { echo "Failed to download ${base_url}/${script_name}" >&2; exit 1; }

# Optional checksum verification. If SHA256SUMS.txt is missing on the release
# (older releases predate this), we surface a clear warning rather than fail.
if curl -fsSL "${base_url}/SHA256SUMS.txt" -o "$tmp/SHA256SUMS.txt" 2>/dev/null; then
  expected="$(awk -v f="$script_name" '$2 == f || $2 == "*"f { print $1; exit }' "$tmp/SHA256SUMS.txt" || true)"
  if [ -z "$expected" ]; then
    echo "Warning: ${script_name} not listed in SHA256SUMS.txt; skipping verification." >&2
  else
    if command -v sha256sum >/dev/null 2>&1; then
      actual="$(sha256sum "$tmp/${script_name}" | awk '{print $1}')"
    else
      actual="$(shasum -a 256 "$tmp/${script_name}" | awk '{print $1}')"
    fi
    if [ "$expected" != "$actual" ]; then
      echo "Checksum mismatch for ${script_name}: expected ${expected}, got ${actual}." >&2
      exit 1
    fi
  fi
else
  echo "Warning: SHA256SUMS.txt not found for ${tag}; running ${script_name} without verification." >&2
fi

# Export so the release script can re-use the resolved tag/repo without
# re-querying the API.
export SOMA_REPO="$repo"
export SOMA_DESKTOP_TAG="$tag"

exec bash "$tmp/${script_name}"
