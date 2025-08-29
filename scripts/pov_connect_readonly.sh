#!/usr/bin/env bash
#
# Splunk read-only connector for POV testing
#
# - Runs a Splunk search via the management REST API (port 8089)
# - Saves results to out/splunk_alerts_24h.json (array of result objects)
# - Optionally posts results to the backend /alerts/ingest endpoint if BACKEND_URL and BACKEND_TOKEN are set
#
# Auth options (choose ONE):
#   1) Basic auth: set SPLUNK_USERNAME and SPLUNK_PASSWORD
#   2) Splunk bearer token: set SPLUNK_BEARER_TOKEN and SPLUNK_BASE_URL
#   3) Splunk session token: set SPLUNK_SESSION_TOKEN and SPLUNK_BASE_URL
#
# Required tools: curl, jq

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="${OUTPUT_DIR:-"$SCRIPT_DIR/../out"}"
mkdir -p "$OUTPUT_DIR"

# Configuration
SPLUNK_BASE_URL=${SPLUNK_BASE_URL:-${SPLUNK_HEC_URL:-"https://localhost:8089"}} # Backward compatible env name
SPLUNK_SEARCH=${SPLUNK_SEARCH:-'search index=_internal earliest=-24h | head 200'}
SPLUNK_OUTPUT_JSON="$OUTPUT_DIR/splunk_alerts_24h.json"
SPLUNK_OUTPUT_RAW="$OUTPUT_DIR/splunk_raw_stream.jsonl"

BACKEND_URL=${BACKEND_URL:-""}
BACKEND_TOKEN=${BACKEND_TOKEN:-""}

echo "[+] Running Splunk search against: $SPLUNK_BASE_URL"
echo "    Query: $SPLUNK_SEARCH"

# Build curl auth flags
AUTH_FLAGS=( )
HEADER_FLAGS=( )

if [[ -n "${SPLUNK_USERNAME:-}" && -n "${SPLUNK_PASSWORD:-}" ]]; then
  AUTH_FLAGS+=( -u "${SPLUNK_USERNAME}:${SPLUNK_PASSWORD}" )
elif [[ -n "${SPLUNK_BEARER_TOKEN:-}" ]]; then
  HEADER_FLAGS+=( -H "Authorization: Bearer ${SPLUNK_BEARER_TOKEN}" )
elif [[ -n "${SPLUNK_SESSION_TOKEN:-}" ]]; then
  HEADER_FLAGS+=( -H "Authorization: Splunk ${SPLUNK_SESSION_TOKEN}" )
else
  echo "[!] Missing Splunk auth. Set either SPLUNK_USERNAME+SPLUNK_PASSWORD or SPLUNK_BEARER_TOKEN or SPLUNK_SESSION_TOKEN." >&2
  exit 1
fi

# Query Splunk export endpoint (streaming JSON). Accept self-signed certs with -k.
curl -fksS \
  "${HEADER_FLAGS[@]}" \
  "${AUTH_FLAGS[@]}" \
  --get "$SPLUNK_BASE_URL/services/search/jobs/export" \
  --data-urlencode search="$SPLUNK_SEARCH" \
  --data-urlencode output_mode=json \
  -o "$SPLUNK_OUTPUT_RAW"

# Convert the streaming JSON into an array of result objects and tag source
if ! command -v jq >/dev/null 2>&1; then
  echo "[!] jq is required but not found. Please install jq." >&2
  exit 1
fi

jq -s '[.[] | select(.result != null) | .result + {source: "splunk"}]' "$SPLUNK_OUTPUT_RAW" > "$SPLUNK_OUTPUT_JSON"

COUNT=$(jq 'length' "$SPLUNK_OUTPUT_JSON")
echo "[+] Saved $COUNT events to $SPLUNK_OUTPUT_JSON"

# Optional: push into backend ingest API
if [[ -n "$BACKEND_URL" && -n "$BACKEND_TOKEN" ]]; then
  echo "[+] Posting to backend ingest: $BACKEND_URL/alerts/ingest"
  jq -c '{alerts: .}' "$SPLUNK_OUTPUT_JSON" | \
  curl -fksS -X POST \
    -H "Authorization: Bearer $BACKEND_TOKEN" \
    -H "Content-Type: application/json" \
    --data-binary @- \
    "$BACKEND_URL/alerts/ingest"
  echo "\n[+] Ingest complete"
else
  echo "[i] Skipping backend ingest (set BACKEND_URL and BACKEND_TOKEN to enable)."
fi
