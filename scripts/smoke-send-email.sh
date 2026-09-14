#!/usr/bin/env bash
#
# Real-send smoke test that gates the production deploy (issue #67,
# ADR-0010). One real POST to the Resend API, to Resend's documented safe
# sink address `delivered@resend.dev` — proves the actual endpoint, auth,
# and payload shape work end to end, which the MSW-stubbed `fetch` in the
# Vitest suite never reaches (it never leaves the process).
#
# Wired into the `dreamport` (production) Workers Builds project's Deploy
# command, chained ahead of `wrangler deploy`:
#
#   npm run smoke:send-email && npx wrangler deploy
#
# `&&` is load-bearing: a non-zero exit here stops `wrangler deploy` from
# running at all, so a broken send path fails the deploy instead of
# shipping silently. This runs once per production deploy, not per PR or
# staging build — `dreamport-staging`'s Version command is untouched — so
# it stays cheap against Resend's shared account quota (ADR-0007).
#
# Needs RESEND_API_KEY in the environment: a Build-time secret on the
# `dreamport` project (Settings -> Build -> Environment variables, marked
# Secret), provisioned via the dashboard like every other credential here
# (no CLI secret writes — see docs/deployment.md). This is deliberately a
# separate credential from the runtime RESEND_API_KEY secret the deployed
# Worker reads at request time (`wrangler secret put`) — same value is fine,
# but they live in different Cloudflare stores and are provisioned
# separately.
#
# delivered@resend.dev sends still count against the account's send quota
# (confirmed against Resend's own docs, not assumed — see
# docs/research-resend-test-address-quota.md), which is the reason this
# runs once per deploy rather than on every PR/CI run.

set -uo pipefail

# Read straight from EMAIL_FROM in src/worker/email/sender.ts rather than
# duplicating the literal here — this script runs as its own step,
# independent of the app build, so it can't `import` that module, but a
# hardcoded copy would silently drift from the real send path (the address
# a rebrand or a new verified domain would actually change) and this smoke
# test would keep "passing" against the stale one.
SENDER_FILE="$(dirname "${BASH_SOURCE[0]}")/../src/worker/email/sender.ts"
FROM=$(grep -oE 'EMAIL_FROM = "[^"]+"' "$SENDER_FILE" | sed -E 's/^EMAIL_FROM = "(.*)"$/\1/')
if [[ -z "$FROM" ]]; then
  echo "Could not read EMAIL_FROM from $SENDER_FILE — smoke test cannot run." >&2
  exit 1
fi
TO="delivered@resend.dev"

if [[ -z "${RESEND_API_KEY:-}" ]]; then
  echo "RESEND_API_KEY is not set — smoke test cannot run. See docs/deployment.md." >&2
  exit 1
fi

RESPONSE_FILE=$(mktemp)
trap 'rm -f "$RESPONSE_FILE"' EXIT

STATUS=$(curl -sS -o "$RESPONSE_FILE" -w '%{http_code}' \
  -X POST "https://api.resend.com/emails" \
  -H "Authorization: Bearer ${RESEND_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"from\":\"${FROM}\",\"to\":\"${TO}\",\"subject\":\"Dreamport deploy smoke test\",\"text\":\"Real-send smoke test gating a production deploy (issue #67). No action needed.\"}")
BODY=$(cat "$RESPONSE_FILE" 2>/dev/null || true)

if [[ "$STATUS" =~ ^2 ]]; then
  echo "Resend smoke send OK (${STATUS}): ${BODY}"
  exit 0
else
  echo "Resend smoke send FAILED (${STATUS}): ${BODY}" >&2
  exit 1
fi
