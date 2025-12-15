#!/usr/bin/env bash
# shellcheck disable=SC1090
set -euo pipefail

# ARG_OPTIONAL_SINGLE([channel],[c],[Release channel],[stable])
# ARG_OPTIONAL_SINGLE([version],[v],[Version override])
# ARG_FLAG([dry-run],[n],[Download only; do not install])
# ARG_HELP([Install Soma desktop (dmg/deb) from GitHub releases.])
# ARGBASH_GO

# This block follows the structure produced by argbash (https://argbash.dev).
print_help() {
  printf 'Usage: %s [--channel <value>] [--version <value>] [--dry-run] [--help]\n' "$0"
  printf '\n'
  printf '    --channel, -c: Release channel (default: stable)\n'
  printf '    --version, -v: Specific version override\n'
  printf '    --dry-run, -n: Download only; do not install\n'
  printf '    --help, -h:    Show this help\n'
}

parse_args() {
  _arg_channel="stable"
  _arg_version=""
  _arg_dry_run="off"
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --channel|--channel=*)
        _val="${1#*=}"; if [ "$1" = "$_val" ]; then shift; _val="$1"; fi; _arg_channel="$_val";;
      -c*)
        _val="${1#-c}"; if [ -z "$_val" ]; then shift; _val="$1"; fi; _arg_channel="$_val";;
      --version|--version=*)
        _val="${1#*=}"; if [ "$1" = "$_val" ]; then shift; _val="$1"; fi; _arg_version="$_val";;
      -v*)
        _val="${1#-v}"; if [ -z "$_val" ]; then shift; _val="$1"; fi; _arg_version="$_val";;
      --dry-run)
        _arg_dry_run="on";;
      -n)
        _arg_dry_run="on";;
      --help|-h)
        print_help; exit 0;;
      *)
        echo "Unknown option: $1" >&2; print_help; exit 1;;
    esac
    shift
  done
}
# ARGBASH_STOP

script_dir="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"

print_banner() {
  if [ -f "${script_dir}/banner.txt" ]; then
    cat "${script_dir}/banner.txt"
  else
    echo "Soma Installer"
  fi
}

detect_platform() {
  case "$(uname -s)" in
    Darwin) echo "mac";;
    Linux) echo "linux";;
    *) echo "unsupported";;
  esac
}

download_artifacts() {
  local platform="$1"
  local version_label="$2"
  local out_dir="$3"
  mkdir -p "$out_dir"
  case "$platform" in
    mac)
      touch "${out_dir}/soma-${version_label}.dmg"
      ;;
    linux)
      touch "${out_dir}/soma-${version_label}.deb"
      ;;
  esac
  cp "${script_dir}/install.sh" "${out_dir}/install.sh"
}

main() {
  parse_args "$@"
  print_banner

  platform="$(detect_platform)"
  if [ "$platform" = "unsupported" ]; then
    echo "Unsupported platform" >&2
    exit 1
  fi

  version_label="${_arg_version:-latest}"
  out_dir="${script_dir}/artifacts"
  download_artifacts "$platform" "$version_label" "$out_dir"

  if [ "$_arg_dry_run" = "on" ]; then
    echo "[dry-run] Downloaded artifacts to ${out_dir}"
    exit 0
  fi

  echo "Installing Soma ${version_label} for ${platform}..."
  echo "(Placeholder install logic goes here.)"
}

main "$@"
