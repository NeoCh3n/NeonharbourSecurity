#!/usr/bin/env bash
set -euo pipefail

INPUT="out/splunk_alerts_24h.json"
OUTPUT="out/pov_weekly.md"

if [[ ! -f "$INPUT" ]]; then
  echo "Input file $INPUT not found" >&2
  exit 1
fi

TOTAL=$(jq 'length' "$INPUT")
if [[ "$TOTAL" -eq 0 ]]; then
  echo "No alerts found in $INPUT" >&2
  exit 1
fi

MTTA=$(jq '[.[] | ((.acknowledged_at | fromdateiso8601) - (.created_at | fromdateiso8601))] | add / length / 60' "$INPUT")
MTTI=$(jq '[.[] | ((.investigated_at | fromdateiso8601) - (.acknowledged_at | fromdateiso8601))] | add / length / 60' "$INPUT")
MTTR=$(jq '[.[] | ((.resolved_at | fromdateiso8601) - (.investigated_at | fromdateiso8601))] | add / length / 60' "$INPUT")
FP=$(jq '[.[] | select(.false_positive == true)] | length' "$INPUT")
FPR=$(jq -n --argjson fp "$FP" --argjson total "$TOTAL" '($fp / $total) * 100')

mkdir -p "$(dirname "$OUTPUT")"
{
  printf "# POV Weekly KPI Report\n\n"
  printf -- "- MTTA: %.2f minutes\n" "$MTTA"
  printf -- "- MTTI: %.2f minutes\n" "$MTTI"
  printf -- "- MTTR: %.2f minutes\n" "$MTTR"
  printf -- "- False Positive Rate: %.2f%%\n" "$FPR"
} > "$OUTPUT"
