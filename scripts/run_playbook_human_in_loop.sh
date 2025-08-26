#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
audit_dir="$repo_root/audit"
mkdir -p "$audit_dir"
audit_file="$audit_dir/$(date +%F).jsonl"

log_action() {
  local action="$1"
  local status="$2"
  local ts
  ts="$(date -Iseconds)"
  printf '{"timestamp":"%s","action":"%s","status":"%s"}\n' "$ts" "$action" "$status" >> "$audit_file"
}

require_approval() {
  local action="$1"
  local response
  read -r -p "Approve action '$action'? [y/N]: " response
  [[ "$response" =~ ^[Yy]$ ]]
}

run_action() {
  local action="$1"
  if require_approval "$action"; then
    echo "Executing $action..."
    log_action "$action" "approved"
  else
    echo "Skipping $action."
    log_action "$action" "denied"
  fi
}

run_action "isolate endpoint"
run_action "disable user"
run_action "recall email"

echo "Audit log saved to $audit_file"
