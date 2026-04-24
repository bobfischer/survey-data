#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
source ~/bin/mcp-config/lib/vault.sh

vault_kill_port || true
mkdir -p ~/logs/mcp
nohup sh -c "$(vault_launch)" > "$(vault_log_file)" 2>&1 &

browser=$(vault_browser)
[ -n "$browser" ] && open "$browser"
echo "✓ $(vault_repo_name) running on :$(vault_port)${browser:+ · ui: $browser}"
