#!/usr/bin/env bash
set -euo pipefail

limit="${MAX_FILE_LINES:-200}"
status=0

while IFS= read -r -d '' file; do
  lines="$(wc -l < "$file" | tr -d ' ')"
  if (( lines > limit )); then
    printf '%s %s\n' "$lines" "$file"
    status=1
  fi
done < <(
  find . -type f \( -name '*.rs' -o -name '*.ts' -o -name '*.tsx' \) \
    -not -path './target/*' \
    -not -path './backend/target/*' \
    -not -path './node_modules/*' \
    -not -path './desktop/*/node_modules/*' \
    -not -path './desktop/desktop-proto/dist/*' \
    -not -path './desktop/desktop-proto/src/gen/*' \
    -not -path './desktop/desktop-proto/src/generated/*' \
    -print0
)

if (( status != 0 )); then
  printf 'Files above %s LoC are listed above.\n' "$limit" >&2
fi

exit "$status"
