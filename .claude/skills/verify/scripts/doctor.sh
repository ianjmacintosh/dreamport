#!/usr/bin/env bash
# Read-only: is the verify instance worth driving? Exit 0 only if every check passes.
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
fail=0
ok()  { echo "ok    $*"; }
bad() { echo "FAIL  $*"; fail=1; }

if [[ -f "$RUN_DIR/pid" ]] && kill -0 "$(cat "$RUN_DIR/pid")" 2>/dev/null; then
  PGID=$(cat "$RUN_DIR/pid"); ok "server process group $PGID alive"
else
  bad "no live verify server (run up.sh)"; exit 1
fi

LISTENER=$(ss -ltnpH "sport = :$PORT" 2>/dev/null | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2)
if [[ -n "$LISTENER" && "$(ps -o pgid= -p "$LISTENER" | tr -d ' ')" == "$PGID" ]]; then
  ok "port $PORT owned by our group (listener pid $LISTENER)"
else
  bad "port $PORT not owned by pgid $PGID (listener: ${LISTENER:-none})"
fi

code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/"); [[ $code == 200 ]] && ok "GET / -> 200" || bad "GET / -> $code"
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/api/me"); [[ $code == 401 ]] && ok "GET /api/me signed out -> 401 (Worker answering)" || bad "GET /api/me -> $code, expected 401"

n=$("$(dirname "${BASH_SOURCE[0]}")/db.sh" "SELECT count(*) AS n FROM d1_migrations" 2>/dev/null | grep -oE '"n": *[0-9]+' | grep -oE '[0-9]+$')
want=$(ls "$ROOT"/migrations/*.sql | wc -l)
[[ "$n" == "$want" ]] && ok "D1 has all $want migrations" || bad "D1 migrations: ${n:-unreadable} of $want"

if curl -s --max-time 2 "$CHROME_DEVTOOLS_AXI_BROWSER_URL/json/version" | grep -q Browser; then
  ok "verify Chromium answering on CDP $CDP_PORT"
else
  bad "no Chromium on CDP $CDP_PORT"
fi

exit $fail
