#!/usr/bin/env bash
#
# One-shot health check for a Workers Builds environment (staging|production).
#
# Runs every check unconditionally and reports all results together. The
# checks are independent of each other — only the live smoke test at the end
# genuinely depends on the others to be unambiguous — so a single run
# surfaces every broken layer instead of discovering them one at a time
# through live request failures.
#
# Usage:
#   scripts/verify-deployment.sh production
#   scripts/verify-deployment.sh staging <preview-url>
#   scripts/verify-deployment.sh staging --latest
#
# Staging has no long-lived host — every version gets its own throwaway
# preview URL (see docs/deployment.md) — so which one to test is never
# guessed silently. Either pass the exact "Version Preview URL" a build just
# printed, or pass --latest to explicitly opt into testing whatever the
# newest version on the Worker happens to be (which may not be the version
# your most recent push produced, if something else built more recently).
# Either way, the resolved URL is printed before any checks run.
#
# Needs CLOUDFLARE_API_TOKEN set (same token wrangler already uses), scoped
# for Workers Scripts (read) and D1 (read) at minimum.
#
# The live smoke test POSTs to the Turnstile-gated send-OTP endpoint with
# Cloudflare's documented dummy token. On staging (always-pass test secret)
# that returns 200 and drives the whole path — gate -> siteverify -> Better
# Auth -> a mock-OTP row written to dreamport-stage's D1. On production (real
# secret) the same request is correctly rejected (403); a 200 there would
# mean production is running a test secret. Verifying the real production
# secret end to end needs a real browser challenge — see
# `e2e/deployment-smoke.spec.ts` (opt-in, `E2E_BASE_URL`; staging only).

set -uo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage:
  scripts/verify-deployment.sh production
  scripts/verify-deployment.sh staging <preview-url>
  scripts/verify-deployment.sh staging --latest
USAGE
}

ENVIRONMENT="${1:-}"
URL_ARG="${2:-}"
TEST_EMAIL="verify-deployment-script@example.com"

if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
  usage
  exit 2
fi

if [[ "$ENVIRONMENT" == "staging" && -z "$URL_ARG" ]]; then
  echo "staging needs either an explicit preview URL or --latest — there is no default." >&2
  usage
  exit 2
fi

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "CLOUDFLARE_API_TOKEN must be set (wrangler and the Cloudflare API calls both need it)." >&2
  exit 2
fi

if [[ "$ENVIRONMENT" == "staging" ]]; then
  WORKER="dreamport-staging"
  DB="dreamport-stage"
  EXPECT_WORKERS_DEV="true"
  EXPECT_PREVIEWS="true"
else
  WORKER="dreamport"
  DB="dreamport-prod"
  EXPECT_WORKERS_DEV="false"
  EXPECT_PREVIEWS="false"
fi

PASS=0
FAIL=0
RESULTS=()

record() {
  local status="$1" label="$2" detail="$3"
  if [[ "$status" == pass ]]; then
    PASS=$((PASS + 1))
    RESULTS+=("✅ ${label} — ${detail}")
  else
    FAIL=$((FAIL + 1))
    RESULTS+=("❌ ${label} — ${detail}")
  fi
}

echo "Verifying ${ENVIRONMENT} (${WORKER})..."
echo

# ── Account id, needed for the raw Cloudflare API calls below ──────────────
ACCOUNT_ID=$(npx wrangler whoami 2>&1 | grep -oE '[0-9a-f]{32}' | head -n1 || true)
if [[ -z "$ACCOUNT_ID" ]]; then
  echo "Could not determine account id from 'wrangler whoami' — check CLOUDFLARE_API_TOKEN." >&2
  exit 2
fi

# ── Which version, and which URL, are we actually testing? ─────────────────
# Resolved and printed up front, before any checks run, so it's never an
# implicit/hidden detail — see the incident this script came out of. Staging
# needs an explicit preview URL or --latest (checked above); there is no
# bare-staging default here the way there is in scripts/e2e.sh, deliberately.
LATEST_VERSION_JSON=$(npx wrangler versions list --name "$WORKER" --json 2>/dev/null || true)
LATEST_VERSION_ID=$(jq -r 'sort_by(.number) | last | .id // empty' <<<"$LATEST_VERSION_JSON")

source "$(dirname "${BASH_SOURCE[0]}")/lib/resolve-deployed-url.sh"

BASE_URL=$(resolve_deployed_url "$ENVIRONMENT" "$URL_ARG" "$LATEST_VERSION_ID") || exit 2
if [[ "$ENVIRONMENT" == "production" ]]; then
  echo "Testing production at: $BASE_URL"
elif [[ "$URL_ARG" == "--latest" ]]; then
  echo "Testing: $BASE_URL"
elif [[ "$BASE_URL" != "$URL_ARG" ]]; then
  echo "Testing: $BASE_URL (trimmed from $URL_ARG)"
else
  echo "Testing: $BASE_URL"
fi
echo

# ── 1. Version bindings ─────────────────────────────────────────────────────
if [[ -z "$LATEST_VERSION_ID" ]]; then
  record fail "Version bindings" "no versions found for $WORKER"
else
  BINDINGS_JSON=$(npx wrangler versions view "$LATEST_VERSION_ID" --name "$WORKER" --json 2>/dev/null || true)
  EXPECTED_DB_ID=$(npx wrangler d1 info "$DB" --json 2>/dev/null | jq -r '.uuid // empty')
  ACTUAL_DB_ID=$(jq -r '.resources.bindings[]? | select(.type=="d1") | .database_id // empty' <<<"$BINDINGS_JSON")
  HAS_SECRET=$(jq -r 'any(.resources.bindings[]?; .name=="BETTER_AUTH_SECRET" and .type=="secret_text")' <<<"$BINDINGS_JSON")
  # Presence only, never the value — same shape as the BETTER_AUTH_SECRET
  # check above. Both environments require this binding now: production has
  # had a real key since #38, and staging is getting one too (issue #70) so
  # manual testing against the deployed staging host exercises real email
  # delivery. The runtime guard in src/worker/index.ts already 503s the
  # send-OTP path on the production host without this secret; this is the
  # detective backstop that catches a key-less version at verify time instead
  # of on a user's failed sign-in (issue #41, #66, #70).
  HAS_RESEND_KEY=$(jq -r 'any(.resources.bindings[]?; .name=="RESEND_API_KEY" and .type=="secret_text")' <<<"$BINDINGS_JSON")
  # TEST_LOGIN_ENABLED is a plain_text var, not a secret, so its value (not
  # just presence) is readable here — and worth reading, since the whole
  # point of this check is to catch it drifting to the wrong environment.
  # Expected "true" on staging (issue #70) and absent/falsy on production —
  # "true" on production would make `buildTestLoginOTP`'s fixed test code
  # (src/worker/auth.ts) a public, unauthenticated sign-in bypass there.
  TEST_LOGIN_VALUE=$(jq -r '.resources.bindings[]? | select(.name=="TEST_LOGIN_ENABLED") | .text // empty' <<<"$BINDINGS_JSON")

  if [[ -z "$ACTUAL_DB_ID" ]]; then
    record fail "Version bindings" "no D1 binding on latest version ($LATEST_VERSION_ID) — build likely selected the wrong CLOUDFLARE_ENV, or didn't rebuild at all"
  elif [[ -n "$EXPECTED_DB_ID" && "$ACTUAL_DB_ID" != "$EXPECTED_DB_ID" ]]; then
    record fail "Version bindings" "D1 binding points at $ACTUAL_DB_ID, expected $DB ($EXPECTED_DB_ID)"
  elif [[ "$HAS_SECRET" != "true" ]]; then
    record fail "Version bindings" "BETTER_AUTH_SECRET missing from latest version's bindings"
  elif [[ "$HAS_RESEND_KEY" != "true" ]]; then
    record fail "Version bindings" "RESEND_API_KEY missing from latest version's bindings — $ENVIRONMENT requires it (the mock sender delivers nothing, and the runtime guard 503s sign-in email on production without it). See issue #70 for staging's provisioning runbook."
  elif [[ "$ENVIRONMENT" == "production" && "$TEST_LOGIN_VALUE" == "true" ]]; then
    record fail "Version bindings" "TEST_LOGIN_ENABLED is \"true\" on production — this is a public, unauthenticated sign-in bypass (buildTestLoginOTP's fixed code in src/worker/auth.ts) and must never be set here. Check wrangler.jsonc's env.production.vars."
  elif [[ "$ENVIRONMENT" == "staging" && "$TEST_LOGIN_VALUE" != "true" ]]; then
    record fail "Version bindings" "TEST_LOGIN_ENABLED is not \"true\" on staging (got: ${TEST_LOGIN_VALUE:-<absent>}) — expected \"true\" so manual testing can use the fixed test-login code (issue #70). Check wrangler.jsonc's env.staging.vars."
  else
    record pass "Version bindings" "DB ($DB), BETTER_AUTH_SECRET, RESEND_API_KEY all present; TEST_LOGIN_ENABLED=$([[ "$ENVIRONMENT" == "staging" ]] && echo "\"true\"" || echo "unset") as expected, on version $LATEST_VERSION_ID"
  fi
fi

# ── 2. Subdomain / preview trigger ──────────────────────────────────────────
SUBDOMAIN_JSON=$(curl -sf -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER}/subdomain" 2>/dev/null || true)
ENABLED=$(jq -r '.result.enabled // empty' <<<"$SUBDOMAIN_JSON")
PREVIEWS=$(jq -r '.result.previews_enabled // empty' <<<"$SUBDOMAIN_JSON")

if [[ -z "$ENABLED" ]]; then
  record fail "Subdomain/preview trigger" "could not read subdomain status from the Cloudflare API"
elif [[ "$ENABLED" != "$EXPECT_WORKERS_DEV" || "$PREVIEWS" != "$EXPECT_PREVIEWS" ]]; then
  record fail "Subdomain/preview trigger" "enabled=$ENABLED previews_enabled=$PREVIEWS (expected enabled=$EXPECT_WORKERS_DEV previews_enabled=$EXPECT_PREVIEWS)"
else
  record pass "Subdomain/preview trigger" "enabled=$ENABLED previews_enabled=$PREVIEWS"
fi

# ── 3. Migrations ───────────────────────────────────────────────────────────
MIGRATIONS_OUT=$(npx wrangler d1 migrations list "$DB" --env "$ENVIRONMENT" --remote 2>&1 || true)
if grep -q "No migrations to apply" <<<"$MIGRATIONS_OUT"; then
  record pass "Migrations" "$DB is fully migrated"
else
  PENDING=$(grep -oE '[0-9]{4}_[A-Za-z0-9_]+\.sql' <<<"$MIGRATIONS_OUT" | paste -sd, - 2>/dev/null)
  record fail "Migrations" "pending on $DB: ${PENDING:-run npm run migrate:$ENVIRONMENT for details}"
fi

# ── 4. Secrets ───────────────────────────────────────────────────────────────
SECRETS_JSON=$(npx wrangler secret list --name "$WORKER" 2>/dev/null || echo '[]')
HAS_AUTH_SECRET=$(jq -r 'any(.[]?; .name=="BETTER_AUTH_SECRET")' <<<"$SECRETS_JSON")
if [[ "$HAS_AUTH_SECRET" == "true" ]]; then
  record pass "Secrets" "BETTER_AUTH_SECRET is set on $WORKER"
else
  record fail "Secrets" "BETTER_AUTH_SECRET is NOT set on $WORKER"
fi

# ── 5. Live smoke test ──────────────────────────────────────────────────────
# POST the Turnstile-gated send endpoint with Cloudflare's dummy token. The
# expected status is environment-specific:
#
#              staging (test secret)          production (real secret)
#   200        healthy — full path works      RED FLAG: prod runs a test secret
#   403        secret set but not the test    healthy — real secret rejects a
#              secret (staging can't get                fake token
#              real tokens, so this is broken)
#   503        TURNSTILE_SECRET_KEY not set   TURNSTILE_SECRET_KEY not set
#   404        send route not deployed        send route not deployed
#   429        rate limited (issue #24) —     (unreached: the real secret
#              gate + limiter both live,       rejects the dummy token at
#              re-run after the window          the gate first)
#
# On staging a 200 also writes one mock-OTP row to dreamport-stage's D1.
# 429 on staging just means this script (or other traffic) has already hit
# the send-OTP limit for TEST_EMAIL within the window — the endpoint is fine.
DUMMY_TOKEN="XXXX.DUMMY.TOKEN.XXXX"
ROOT_STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/" || echo 000)
OTP_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/auth/email-otp/send-verification-otp" \
  -H "Content-Type: application/json" \
  -H "x-turnstile-token: ${DUMMY_TOKEN}" \
  -d "{\"email\":\"${TEST_EMAIL}\",\"type\":\"sign-in\"}" || echo 000)

if [[ "$ENVIRONMENT" == "staging" ]]; then
  OTP_OK=200
  OTP_403_MSG="secret is set but is not the always-pass test secret (staging can't obtain real tokens — see docs/deployment.md)"
else
  OTP_OK=403
  OTP_403_MSG="" # 403 is the healthy production result
fi

if [[ "$ROOT_STATUS" != "200" ]]; then
  record fail "Live smoke test" "GET $BASE_URL/ -> $ROOT_STATUS (expected 200)"
elif [[ "$OTP_STATUS" == "$OTP_OK" ]]; then
  record pass "Live smoke test" "$BASE_URL up; send-OTP gate returned $OTP_STATUS for the dummy token (expected for $ENVIRONMENT)"
elif [[ "$OTP_STATUS" == "429" ]]; then
  record pass "Live smoke test" "$BASE_URL up; send-OTP path is rate limited (429, issue #24) — gate + limiter reachable; re-run after the window resets for a full-path check"
elif [[ "$OTP_STATUS" == "503" ]]; then
  record fail "Live smoke test" "send-verification-otp -> 503: TURNSTILE_SECRET_KEY is not set on $WORKER"
elif [[ "$ENVIRONMENT" == "production" && "$OTP_STATUS" == "200" ]]; then
  record fail "Live smoke test" "send-verification-otp -> 200 for a dummy token: production is running a Turnstile TEST secret"
elif [[ "$OTP_STATUS" == "403" ]]; then
  record fail "Live smoke test" "send-verification-otp -> 403: ${OTP_403_MSG}"
else
  record fail "Live smoke test" "send-verification-otp -> $OTP_STATUS (expected $OTP_OK for $ENVIRONMENT)"
fi

# ── 6. Turnstile site key in the client bundle ──────────────────────────────
# The exact failure from the #23 staging rollout: VITE_TURNSTILE_SITE_KEY was
# dropped at build time, so the login chunk shipped `siteKey: undefined` and
# the widget could not render. Walk index.html -> its chunk -> the login
# chunk and look for a real site key literal.
#
# index.html links its entry as `/assets/index-*.js`, but chunk-to-chunk
# refs inside that entry are `assets/login-*.js` / `./login-*.js` (no leading
# slash) — so match the basename and rebuild the `/assets/` path.
BUNDLE_KEY=""
INDEX_JS=$(curl -s "$BASE_URL/" | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' | head -n1)
if [[ -n "$INDEX_JS" ]]; then
  LOGIN_JS=$(curl -s "${BASE_URL}${INDEX_JS}" | grep -oE 'login-[A-Za-z0-9_-]+\.js' | head -n1)
  if [[ -n "$LOGIN_JS" ]]; then
    BUNDLE_KEY=$(curl -s "${BASE_URL}/assets/${LOGIN_JS}" \
      | grep -oE '"(0x4[A-Za-z0-9_-]{15,}|[123]x0{10,}[A-Za-z0-9]{2})"' | head -n1)
  fi
fi
if [[ -z "$BUNDLE_KEY" ]]; then
  record fail "Turnstile site key" "no VITE_TURNSTILE_SITE_KEY baked into the login bundle — the build variable was dropped (see docs/deployment.md, Build step)"
else
  record pass "Turnstile site key" "login bundle carries site key ${BUNDLE_KEY}"
fi

# ── Report ───────────────────────────────────────────────────────────────────
echo
for r in "${RESULTS[@]}"; do echo "$r"; done
echo
echo "${PASS} passed, ${FAIL} failed."
[[ "$FAIL" -eq 0 ]]
