#!/usr/bin/env bash
# Print the current @uid of the first element whose snapshot line reads
# `<role> "<accessible name>"`, polling up to 10s for it to render.
# chrome-devtools-axi refs go stale after every command, so look one up right
# before using it — or use act.sh, which does both and fails loudly.
# Usage: ref.sh button "Send Code"     -> @g7:2_10
# On a miss: exit 1, and the last snapshot is saved to .wrangler/verify-run-<port>/last-miss.txt
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
role=$1 name=$2
for _ in $(seq 1 20); do
  snap=$(chrome-devtools-axi snapshot)
  # One awk pass: a `grep | head` pipeline under pipefail can die of SIGPIPE
  # on a long snapshot and silently return nothing.
  uid=$(awk -v pat=" $role \"$name\"" '
    !found && index($0, pat) { match($0, /uid=[^ ]+/); print substr($0, RSTART + 4, RLENGTH - 4); found = 1 }' <<<"$snap")
  [[ -n "$uid" ]] && { echo "@$uid"; exit 0; }
  sleep 0.5
done
mkdir -p "$RUN_DIR"; printf '%s\n' "$snap" >"$RUN_DIR/last-miss.txt"
echo "no $role \"$name\" after 10s; snapshot in $RUN_DIR/last-miss.txt" >&2
exit 1
