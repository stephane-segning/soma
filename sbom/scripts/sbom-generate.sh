#!/usr/bin/env bash
set -euo pipefail

# ARG_OPTIONAL_SINGLE([target],[t],[Path to scan],[.])
# ARG_OPTIONAL_SINGLE([format],[f],[SBOM format],[spdx-json])
# ARG_HELP([Generate SBOM artifacts (placeholder).])
# ARGBASH_GO

print_help() {
  printf 'Usage: %s [--target <dir>] [--format <fmt>] [--help]\n' "$0"
}

parse_args() {
  _arg_target="."
  _arg_format="spdx-json"
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --target|--target=*)
        _val="${1#*=}"; if [ "$1" = "$_val" ]; then shift; _val="$1"; fi; _arg_target="$_val";;
      -t*)
        _val="${1#-t}"; if [ -z "$_val" ]; then shift; _val="$1"; fi; _arg_target="$_val";;
      --format|--format=*)
        _val="${1#*=}"; if [ "$1" = "$_val" ]; then shift; _val="$1"; fi; _arg_format="$_val";;
      -f*)
        _val="${1#-f}"; if [ -z "$_val" ]; then shift; _val="$1"; fi; _arg_format="$_val";;
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
  mkdir -p "${script_dir}/output"
  out_file="${script_dir}/output/sbom.${_arg_format}"
  echo "SBOM placeholder for target=${_arg_target} format=${_arg_format}" > "$out_file"
  echo "Wrote $out_file"
}

main "$@"
