#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env}"
TMP_FILE="${ENV_FILE}.tmp.$$"

if [ ! -f "$ENV_FILE" ]; then
  echo "[error] $ENV_FILE not found" >&2
  exit 1
fi

cp "$ENV_FILE" "$TMP_FILE"

echo "[info] Migrating OpenAI env vars to DeepSeek in $ENV_FILE (in-place)"

# 1) Rename keys preserving values
#    OPENAI_API_KEY -> DEEPSEEK_API_KEY
#    OPENAI_BASE_URL -> DEEPSEEK_BASE_URL
#    OPENAI_MODEL -> DEEPSEEK_MODEL

perl -0777 -pe 's/^OPENAI_API_KEY=(.*)$/DEEPSEEK_API_KEY=$1/gm' -i "$TMP_FILE"
perl -0777 -pe 's/^OPENAI_BASE_URL=(.*)$/DEEPSEEK_BASE_URL=$1/gm' -i "$TMP_FILE"
perl -0777 -pe 's/^OPENAI_MODEL=(.*)$/DEEPSEEK_MODEL=$1/gm' -i "$TMP_FILE"

# 2) Normalize DeepSeek base URL to official endpoint when previous value was OpenAI
perl -0777 -pe 's/^DEEPSEEK_BASE_URL=https?:\/\/api\.openai\.com\/?v?1?$/DEEPSEEK_BASE_URL=https:\/\/api.deepseek.com\/v1/gm' -i "$TMP_FILE" || true

# 3) If model appears to be OpenAI model id, default to deepseek-chat
perl -0777 -pe 's/^DEEPSEEK_MODEL=(gpt-[^\n]*|openai\/[^\n]*)$/DEEPSEEK_MODEL=deepseek-chat/gm' -i "$TMP_FILE" || true

# 4) Comment out remaining OPENAI_* lines (if any were not matched above)
perl -0777 -pe 's/^(OPENAI_[A-Z_]+=.*)$/# migrated: $1/gm' -i "$TMP_FILE"

# 5) Ensure placeholders if missing
grep -qE '^DEEPSEEK_BASE_URL=' "$TMP_FILE" || echo 'DEEPSEEK_BASE_URL=https://api.deepseek.com/v1' >> "$TMP_FILE"
grep -qE '^DEEPSEEK_MODEL=' "$TMP_FILE" || echo 'DEEPSEEK_MODEL=deepseek-chat' >> "$TMP_FILE"
grep -qE '^DEEPSEEK_API_KEY=' "$TMP_FILE" || echo 'DEEPSEEK_API_KEY=' >> "$TMP_FILE"

mv "$TMP_FILE" "$ENV_FILE"
echo "[done] Migration complete. Review $ENV_FILE and set DEEPSEEK_API_KEY if empty."

