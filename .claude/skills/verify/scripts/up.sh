#!/usr/bin/env bash
# Boot a private dreamport Worker for verification: fresh D1 under
# .wrangler/verify-state-<port>, migrations applied, Vite on $VERIFY_PORT (5175).
# Never touches the 5173 dev server or the 5174 e2e server.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
cd "$ROOT"

if [[ -f "$RUN_DIR/pid" ]] && kill -0 "$(cat "$RUN_DIR/pid")" 2>/dev/null; then
  echo "verify instance already running (pgid $(cat "$RUN_DIR/pid")) at $BASE_URL — run doctor.sh, or down.sh first"
  exit 1
fi
if curl -s -o /dev/null --max-time 2 "$BASE_URL/" || curl -s -o /dev/null --max-time 2 "$CHROME_DEVTOOLS_AXI_BROWSER_URL/json/version"; then
  echo "port $PORT or $CDP_PORT answers but no verify pid file owns it — not ours, refusing. Pick another: VERIFY_PORT=5176 VERIFY_CDP_PORT=9236 $0"
  exit 1
fi
[[ -f .dev.vars ]] || { echo ".dev.vars missing — cp .dev.vars.example .dev.vars (README: Local development setup)"; exit 1; }

rm -rf "$STATE_DIR" "$RUN_DIR"
mkdir -p "$RUN_DIR"
npx wrangler d1 migrations apply dreamport-local --env local --local \
  --persist-to "$STATE_DIR" >"$RUN_DIR/migrate.log" 2>&1 \
  || { echo "migrations failed; see $RUN_DIR/migrate.log"; exit 1; }

# Any failure from here on tears down whatever this run started.
trap '"$(dirname "${BASH_SOURCE[0]}")/down.sh" >/dev/null' ERR
fail() { echo "$*"; "$(dirname "${BASH_SOURCE[0]}")/down.sh" >/dev/null; exit 1; }

# setsid: the server becomes its own process group, so down.sh can stop it
# and every child (workerd) by group id without matching names.
CLOUDFLARE_PERSIST_DIR="$STATE_DIR" CLOUDFLARE_ENV=local \
  setsid npx vite --port "$PORT" --strictPort \
  >"$RUN_DIR/server.log" 2>&1 </dev/null &
echo $! >"$RUN_DIR/pid"

CHROMIUM=$(node -e "console.log(require('playwright-core').chromium.executablePath())")
setsid "$CHROMIUM" --headless=new --remote-debugging-port="$CDP_PORT" \
  --user-data-dir="$RUN_DIR/chrome-profile" --no-first-run --no-sandbox about:blank \
  >"$RUN_DIR/chrome.log" 2>&1 </dev/null &
echo $! >"$RUN_DIR/chrome.pid"

for _ in $(seq 1 90); do
  if curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/" | grep -q 200; then
    curl -s -o /dev/null --max-time 2 "$CHROME_DEVTOOLS_AXI_BROWSER_URL/json/version" \
      || { sleep 1; continue; }
    echo "ready: $BASE_URL (server pgid $(cat "$RUN_DIR/pid"), browser pgid $(cat "$RUN_DIR/chrome.pid"), CDP $CDP_PORT)"
    echo "logs: $RUN_DIR/server.log $RUN_DIR/chrome.log"
    exit 0
  fi
  kill -0 "$(cat "$RUN_DIR/pid")" 2>/dev/null || fail "server exited; tail of log: $(tail -20 "$RUN_DIR/server.log")"
  kill -0 "$(cat "$RUN_DIR/chrome.pid")" 2>/dev/null || fail "Chromium exited; tail of log: $(tail -5 "$RUN_DIR/chrome.log")"
  sleep 1
done
fail "not ready after 90s; tail of log: $(tail -20 "$RUN_DIR/server.log")"
