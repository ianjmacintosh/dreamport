#!/usr/bin/env bash
# Wait until <text> appears in the accessibility snapshot (default 30s).
# Use this, not `chrome-devtools-axi wait`, which can error out when the page
# swaps content mid-wait (seen on the sign-in email -> code step).
# Usage: wait.sh "Six-digit code" [seconds]
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
text=$1 secs=${2:-30}
for _ in $(seq 1 $((secs * 2))); do
  snap=$(chrome-devtools-axi snapshot 2>/dev/null)
  [[ "$snap" == *"$text"* ]] && { echo "saw \"$text\""; exit 0; }
  sleep 0.5
done
mkdir -p "$RUN_DIR"; printf '%s\n' "$snap" >"$RUN_DIR/last-miss.txt"
echo "\"$text\" not seen after ${secs}s; snapshot in $RUN_DIR/last-miss.txt" >&2
exit 1
