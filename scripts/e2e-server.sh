#!/usr/bin/env bash
#
# Boot the local Worker for one Playwright run: a fresh dev server on its own
# port, with its own empty state directory and freshly applied migrations.
# Playwright starts this through `webServer` and stops it when the run ends.
#
# Why not reuse the dev server on 5173 (#150):
#   - workerd's memory grows ~100 MB with every e2e run and never comes back,
#     mostly native memory outside any JavaScript heap. A long-lived dev
#     server that absorbs run after run ends up as the process the kernel's
#     OOM killer takes.
#   - A run against a dev server shares its local D1 files and in-memory
#     state, and loses both if that server is killed mid-run.
# A per-run server starts at ~0.3 GB and is gone when the run ends.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

STATE_DIR=.wrangler/e2e-state
PORT=5174

rm -rf "$STATE_DIR"
npx wrangler d1 migrations apply dreamport-local --env local --local \
  --persist-to "$STATE_DIR"

CLOUDFLARE_PERSIST_DIR="$STATE_DIR" CLOUDFLARE_ENV=local \
  exec npx vite --port "$PORT" --strictPort
