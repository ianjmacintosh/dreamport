#!/usr/bin/env bash
# Run one read-only SQL query against the verify instance's local D1; prints JSON.
# Usage: db.sh "SELECT name FROM products"
# Evidence only — never write rows here; set state through the UI.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
cd "$ROOT"
npx wrangler d1 execute dreamport-local --env local --local \
  --persist-to "$STATE_DIR" --json --command "$1" 2>/dev/null
