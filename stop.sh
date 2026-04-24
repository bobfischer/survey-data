#!/usr/bin/env bash
set -euo pipefail
source ~/bin/mcp-config/lib/vault.sh
if vault_kill_port; then
  echo "✓ stopped $(vault_repo_name)"
else
  echo "○ $(vault_repo_name) was not running"
fi
