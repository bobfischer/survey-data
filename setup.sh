#!/bin/bash
# Setup survey-data MCP server (safe to re-run)
set -e

cd "$(dirname "$0")"

echo "=== Survey Data Setup ==="
npm install
npm run build
echo "=== Done ==="
