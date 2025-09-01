#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env}"

touch "$ENV_FILE"

echo "[info] Ensuring DeepSeek placeholders exist in $ENV_FILE (no secrets written)"

ensure_line() {
  local key="$1"; shift
  local value="$1"; shift
  if ! grep -qE "^${key}=" "$ENV_FILE"; then
    echo "${key}=${value}" >> "$ENV_FILE"
    echo "  - added ${key}"
  else
    echo "  - kept existing ${key}"
  fi
}

# Add commented header once
if ! grep -q "# ---- DeepSeek placeholders ----" "$ENV_FILE"; then
  cat >> "$ENV_FILE" <<'EOF'

# ---- DeepSeek placeholders ----
# Fill DEEPSEEK_API_KEY with your DeepSeek key manually (do not commit!)
EOF
  echo "  - added section header"
fi

# Non-secret defaults safe to write
ensure_line DEEPSEEK_BASE_URL "https://api.deepseek.com/v1"
ensure_line DEEPSEEK_MODEL "deepseek-chat"

# Secret placeholder left blank for manual edit
if ! grep -qE "^DEEPSEEK_API_KEY=" "$ENV_FILE"; then
  echo "DEEPSEEK_API_KEY=" >> "$ENV_FILE"
  echo "  - added DEEPSEEK_API_KEY (blank)"
else
  echo "  - kept existing DEEPSEEK_API_KEY"
fi

echo "[done] Review $ENV_FILE and add your actual DEEPSEEK_API_KEY."
