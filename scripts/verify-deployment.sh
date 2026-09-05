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
# The live smoke test writes one real mock-OTP record for a fixed test
# address into whichever environment's D1 database it targets. EMAIL_MODE is
# `mock` in every environment today, so nothing is actually sent — but it is
# a real write, not a read-only check, including against production.

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
ROOT_STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/" || echo 000)
OTP_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/auth/email-otp/send-verification-otp" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${TEST_EMAIL}\",\"type\":\"sign-in\"}" || echo 000)

if [[ "$ROOT_STATUS" != "200" ]]; then
  record fail "Live smoke test" "GET $BASE_URL/ -> $ROOT_STATUS (expected 200)"
elif [[ "$OTP_STATUS" != "200" ]]; then
  record fail "Live smoke test" "POST .../send-verification-otp -> $OTP_STATUS (expected 200)"
else
  record pass "Live smoke test" "$BASE_URL responded correctly end to end"
fi

# ── Report ───────────────────────────────────────────────────────────────────
echo
for r in "${RESULTS[@]}"; do echo "$r"; done
echo
echo "${PASS} passed, ${FAIL} failed."
[[ "$FAIL" -eq 0 ]]
