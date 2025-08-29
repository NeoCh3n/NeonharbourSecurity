# Splunk Read‑Only Integration (POV Test)

This guide shows how to connect a local Splunk instance to the platform for a read‑only proof‑of‑value test. It uses Splunk's management REST API to pull events and (optionally) posts them to the backend `/alerts/ingest` endpoint.

## Prerequisites

- Splunk running locally
  - Web UI: `http://localhost:8000` (for reference)
  - Management API: `https://localhost:8089` (used by this integration)
- Valid Splunk credentials (or a bearer/session token)
- `curl` and `jq` installed
- Platform backend running at `http://localhost:3000` (for ingest)

## Quick Test: Verify Splunk API

```bash
curl -k -u admin:your_password \
  --get https://localhost:8089/services/server/info \
  --data-urlencode output_mode=json | jq .
```

If you prefer tokens, use one of:

- Bearer token: `-H "Authorization: Bearer <token>"`
- Splunk session token: `-H "Authorization: Splunk <session_key>"`

## Run the Read‑Only Pull Script

The script will:
- Execute a Splunk search (default: last 24h from `_internal`)
- Save results as an array to `out/splunk_alerts_24h.json`
- Optionally push to the backend ingest API

```bash
# Choose one auth method
export SPLUNK_USERNAME=admin
export SPLUNK_PASSWORD=your_password
# or
# export SPLUNK_BEARER_TOKEN=...    # Authorization: Bearer ...
# or
# export SPLUNK_SESSION_TOKEN=...   # Authorization: Splunk ...

export SPLUNK_BASE_URL=https://localhost:8089
export SPLUNK_SEARCH='search index=_internal earliest=-15m | head 50'

# Optional: ingest into backend
export BACKEND_URL=http://localhost:3000
export BACKEND_TOKEN=$(curl -s -X POST "$BACKEND_URL/auth/register" \
  -H 'Content-Type: application/json' \
  -d '{"email":"pov@local","password":"pov12345"}' | jq -r .token)

# Run
bash scripts/pov_connect_readonly.sh
```

Outputs:
- Raw stream: `out/splunk_raw_stream.jsonl`
- Parsed array: `out/splunk_alerts_24h.json`

If `BACKEND_URL` and `BACKEND_TOKEN` are set, the script posts to `POST /alerts/ingest`.

## Map Test Data Into Splunk (Optional)

To generate noisy web logs and index them in Splunk:

1) Generate logs locally
```bash
python3 log_generator.py
```
Logs write to `~/splunk_logs/apache_access.log`.

2) In Splunk Web (`http://localhost:8000`), add a file monitor input:
- Settings → Data Inputs → Files & Directories → New Local File
- Path: `~/splunk_logs/apache_access.log`
- Source type: `access_combined` (or auto)
- Index: `main` (or a test index)

3) Update your search in env and re‑run the script, e.g.:
```bash
export SPLUNK_SEARCH='search index=main sourcetype=access_combined earliest=-30m'
bash scripts/pov_connect_readonly.sh
```

## Troubleshooting

- 401/403 errors: verify credentials or token type. For Basic Auth, use `-u user:pass`. For tokens, pick the correct header (`Bearer` vs `Splunk`).
- SSL errors: the script uses `-k` to accept Splunk's self‑signed cert on 8089.
- Empty results: try `index=_internal | head 10` to validate connectivity.
- `jq: command not found`: install jq (`brew install jq` on macOS).

## What’s Next

- Add a saved search in Splunk and use it in `SPLUNK_SEARCH` for consistent test data.
- Wire a webhook alert action in Splunk to call a future `/alerts/webhook/splunk` endpoint (Phase B automation).
