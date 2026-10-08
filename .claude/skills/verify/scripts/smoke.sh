#!/usr/bin/env bash
# End-to-end smoke of the verify harness and the core user path, on a fresh
# instance: launch, doctor, sign in through the UI, add a Product, reload,
# check D1, delete it (two-step confirm), reload, check D1, tear down.
# Exits non-zero at the first failed step. Evidence survives in
# .wrangler/verify-evidence/<timestamp>-smoke/. Also a worked example of
# chaining the helpers — copy it as the starting point for a feature proof.
# Usage: .claude/skills/verify/scripts/smoke.sh
set -euo pipefail
S=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
source "$S/lib.sh"
"$S/up.sh"
# Only after our own up.sh succeeded: never tear down an instance we didn't start.
trap '"$S/down.sh" >/dev/null' EXIT
"$S/doctor.sh" >/dev/null
E=$EVIDENCE_DIR/$(date +%Y%m%d-%H%M%S)-smoke; mkdir -p "$E"

# Sign in (sign-in.md)
chrome-devtools-axi open "$BASE_URL/" >/dev/null
"$S/act.sh" click link 'Log In'
"$S/wait.sh" 'Success!'   # Turnstile solved
"$S/act.sh" fill textbox 'Email address' 'delivered+verify+e2e-test@resend.dev'
"$S/act.sh" click button 'Send Code'
"$S/wait.sh" 'Six-digit code'
chrome-devtools-axi type 000000 >/dev/null
"$S/wait.sh" 'Add Product'
[[ $(chrome-devtools-axi eval 'location.pathname') == *'"/app'* ]] || { echo "not on /app after sign-in" >&2; exit 1; }

# Add, persist, delete a Product (products.md)
N="Verify smoke $(date +%s)"
"$S/act.sh" fill textbox 'Product name' "$N"
"$S/act.sh" click button 'Add Product'
"$S/wait.sh" "$N"
chrome-devtools-axi eval 'location.reload()' >/dev/null
"$S/wait.sh" "link \"$N\""
chrome-devtools-axi snapshot >"$E/01-after-add-reload.snapshot.txt"
chrome-devtools-axi screenshot "$E/01-after-add-reload.png" >/dev/null
"$S/db.sh" 'SELECT name FROM products' >"$E/02-db-after-add.json"
grep -q "$N" "$E/02-db-after-add.json" || { echo "Product not in D1" >&2; exit 1; }

"$S/act.sh" click button 'Delete'
"$S/wait.sh" 'button "Cancel"'
"$S/act.sh" click button 'Delete'
for _ in $(seq 1 20); do
  [[ $(chrome-devtools-axi snapshot) != *"$N"* ]] && break; sleep 0.5
done
chrome-devtools-axi eval 'location.reload()' >/dev/null
"$S/wait.sh" 'Add Product'
chrome-devtools-axi snapshot >"$E/03-after-delete-reload.snapshot.txt"
! grep -q "$N" "$E/03-after-delete-reload.snapshot.txt" || { echo "Product still listed after delete" >&2; exit 1; }
"$S/db.sh" 'SELECT count(*) AS n FROM products' >"$E/04-db-after-delete.json"
grep -qE '"n": *0' "$E/04-db-after-delete.json" || { echo "Product row still in D1" >&2; exit 1; }

echo "smoke passed; evidence: $E"
