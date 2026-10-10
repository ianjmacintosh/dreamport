# Shared paths for the verify helpers. Sourced, not run.
ROOT=$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)
PORT=${VERIFY_PORT:-5175}
STATE_DIR="$ROOT/.wrangler/verify-state-$PORT" # D1 + KV for this instance; wiped by down.sh
RUN_DIR="$ROOT/.wrangler/verify-run-$PORT"     # pid files + logs; wiped by down.sh
EVIDENCE_DIR="$ROOT/.wrangler/verify-evidence" # proof; down.sh never touches it
BASE_URL="http://localhost:$PORT"
CDP_PORT=${VERIFY_CDP_PORT:-9235}
# chrome-devtools-axi can't find a system Chrome in this devcontainer, so
# up.sh launches Playwright's Chromium with a debug port and the bridge
# attaches to it. Its own session name keeps it off anyone else's bridge.
export CHROME_DEVTOOLS_AXI_SESSION="verify-$PORT"
export CHROME_DEVTOOLS_AXI_BROWSER_URL="http://127.0.0.1:$CDP_PORT"

# With no verify Chromium answering, an axi command starts a bridge aimed at
# a dead CDP port, and that bridge never exits (#175). Refuse instead. `stop`
# passes through, so down.sh can still close the session.
chrome-devtools-axi() {
  if [[ "${1:-}" != stop ]] && ! curl -s --max-time 2 "$CHROME_DEVTOOLS_AXI_BROWSER_URL/json/version" | grep -q Browser; then
    echo "verify Chromium isn't answering on $CHROME_DEVTOOLS_AXI_BROWSER_URL: run up.sh first" >&2
    return 1
  fi
  command chrome-devtools-axi "$@"
}
