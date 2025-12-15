#!/usr/bin/env bash
set -euo pipefail

# ARG_OPTIONAL_SINGLE([sbom],[s],[Path to SBOM file],[output/sbom.spdx-json])
# ARG_HELP([Scan an SBOM for vulnerabilities (placeholder).])
# ARGBASH_GO

print_help() {
  printf 'Usage: %s [--sbom <path>] [--help]\n' "$0"
}

parse_args() {
  _arg_sbom="output/sbom.spdx-json"
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --sbom|--sbom=*)
        _val="${1#*=}"; if [ "$1" = "$_val" ]; then shift; _val="$1"; fi; _arg_sbom="$_val";;
      -s*)
        _val="${1#-s}"; if [ -z "$_val" ]; then shift; _val="$1"; fi; _arg_sbom="$_val";;
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
  fi
}

main() {
  parse_args "$@"
  print_banner
  echo "Scanning SBOM (placeholder): ${_arg_sbom}"
  echo "No vulnerabilities detected (stub)."
}

main "$@"
