#!/usr/bin/env bash
# Stop only what up.sh started (by its recorded process group), close the
# verify browser session, and wipe instance state. Evidence is kept.
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

chrome-devtools-axi stop >/dev/null 2>&1 || true

stopped=0
for f in pid chrome.pid; do
  [[ -f "$RUN_DIR/$f" ]] || continue
  PGID=$(cat "$RUN_DIR/$f")
  kill -TERM -- "-$PGID" 2>/dev/null || true
  for _ in $(seq 1 10); do kill -0 -- "-$PGID" 2>/dev/null || break; sleep 1; done
  kill -KILL -- "-$PGID" 2>/dev/null || true
  echo "stopped pgid $PGID ($f)"; stopped=1
done
[[ $stopped == 1 ]] || echo "no pid files; nothing to stop"
rm -rf "$STATE_DIR" "$RUN_DIR"
echo "evidence kept in $EVIDENCE_DIR"
