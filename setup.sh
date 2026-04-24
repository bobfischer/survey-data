#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
source ~/bin/mcp-config/lib/vault.sh

npm install
[ -f tsconfig.json ] && npm run build

vault_pull_env || cp -n .env.example .env 2>/dev/null || true
vault_pull_assets
echo "✓ $(vault_repo_name) setup complete"
