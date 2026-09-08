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
# implicit/hidden detail — see the incident this script came out of.
LATEST_VERSION_JSON=$(npx wrangler versions list --name "$WORKER" --json 2>/dev/null || true)
LATEST_VERSION_ID=$(jq -r 'sort_by(.number) | last | .id // empty' <<<"$LATEST_VERSION_JSON")

if [[ "$ENVIRONMENT" == "production" ]]; then
  BASE_URL="https://dreamport.ianjmacintosh.com"
  echo "Testing production at: $BASE_URL"
elif [[ "$URL_ARG" == "--latest" ]]; then
  if [[ -z "$LATEST_VERSION_ID" ]]; then
    echo "No versions found for $WORKER — can't resolve --latest." >&2
    exit 2
  fi
  BASE_URL="https://${LATEST_VERSION_ID:0:8}-dreamport-staging.bananasquad.workers.dev"
  echo "--latest resolved to version $LATEST_VERSION_ID: $BASE_URL"
  echo "(this may not be the version your most recent push produced — pass the exact preview URL to be sure)"
else
  # Accept a full page URL (address-bar paste) and reduce it to scheme+host,
  # so ".../login" doesn't turn the smoke test into a POST to a nonsense path.
  BASE_URL=$(sed -E 's#^(https?://[^/]+).*#\1#' <<<"$URL_ARG")
  if [[ "$BASE_URL" != "$URL_ARG" ]]; then
    echo "Testing: $BASE_URL (trimmed from $URL_ARG)"
  else
    echo "Testing: $BASE_URL"
  fi
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
  HAS_EMAIL_MODE=$(jq -r 'any(.resources.bindings[]?; .name=="EMAIL_MODE")' <<<"$BINDINGS_JSON")

  if [[ -z "$ACTUAL_DB_ID" ]]; then
    record fail "Version bindings" "no D1 binding on latest version ($LATEST_VERSION_ID) — build likely selected the wrong CLOUDFLARE_ENV, or didn't rebuild at all"
  elif [[ -n "$EXPECTED_DB_ID" && "$ACTUAL_DB_ID" != "$EXPECTED_DB_ID" ]]; then
    record fail "Version bindings" "D1 binding points at $ACTUAL_DB_ID, expected $DB ($EXPECTED_DB_ID)"
  elif [[ "$HAS_SECRET" != "true" ]]; then
    record fail "Version bindings" "BETTER_AUTH_SECRET missing from latest version's bindings"
  elif [[ "$HAS_EMAIL_MODE" != "true" ]]; then
    record fail "Version bindings" "EMAIL_MODE missing from latest version's bindings"
  else
    record pass "Version bindings" "DB ($DB), BETTER_AUTH_SECRET, EMAIL_MODE all present on version $LATEST_VERSION_ID"
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
#
# On staging a 200 also writes one mock-OTP row to dreamport-stage's D1.
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
