#!/usr/bin/env bash
# Look up an element by role + accessible name and act on it, in one step that
# exits non-zero if the element never appears or the action errors.
# Usage: act.sh click button "Send Code"
#        act.sh fill  textbox "Email address" "delivered+verify+e2e-test@resend.dev"
#        act.sh hover link "Learn More"
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
verb=$1 role=$2 name=$3; shift 3
# The page can re-render between the lookup and the action (Turnstile solving,
# a list refetch), which makes the ref stale; look it up again and retry.
for _ in 1 2 3 4 5; do
  ref=$("$(dirname "${BASH_SOURCE[0]}")/ref.sh" "$role" "$name") || exit 1
  out=$(chrome-devtools-axi "$verb" "$ref" "$@" 2>&1); rc=$?
  grep -q 'STALE_REF' <<<"$out" && { sleep 0.5; continue; }
  if [[ $rc -ne 0 ]] || grep -q '^error:' <<<"$out"; then
    echo "$verb $role \"$name\" failed: $(grep -m1 '^error:' <<<"$out")" >&2; exit 1
  fi
  echo "$verb $role \"$name\" ok"; exit 0
done
echo "$verb $role \"$name\" failed: ref kept going stale (page still re-rendering?)" >&2
exit 1
