#!/usr/bin/env bash
set -euo pipefail

: "${SPLUNK_HEC_URL:?SPLUNK_HEC_URL is required}"
: "${SPLUNK_HEC_TOKEN:?SPLUNK_HEC_TOKEN is required}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/../out"
mkdir -p "$OUTPUT_DIR"

curl -fksS \
  -H "Authorization: Splunk $SPLUNK_HEC_TOKEN" \
  --get "$SPLUNK_HEC_URL/services/search/jobs/export" \
  --data-urlencode search='search severity="high" earliest=-24h' \
  --data-urlencode output_mode=json \
  -o "$OUTPUT_DIR/splunk_alerts_24h.json"
