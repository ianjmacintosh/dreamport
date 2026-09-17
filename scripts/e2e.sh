#!/usr/bin/env bash
#
# Run the Playwright e2e suite — locally by default, or against an
# already-deployed environment.
#
# Usage:
#   scripts/e2e.sh                          # local Worker (today's default)
#   scripts/e2e.sh production
#   scripts/e2e.sh staging                  # the long-lived staging host
#   scripts/e2e.sh staging <preview-url>
#   scripts/e2e.sh staging --latest
#
# Any of the above can take further Playwright CLI args after it (e.g.
# `--grep`), which pass straight through — same as calling `npx playwright
# test` directly. Only a literal leading `staging`/`production` is treated as
# an environment selector; everything else goes to Playwright untouched, so
# `scripts/e2e.sh --grep foo` (no environment) behaves exactly like
# `npx playwright test --reporter=list --grep foo` always did.
#
# With no environment selected, this is exactly `npx playwright test
# --reporter=list` — no E2E_BASE_URL, so playwright.config.ts takes the local
# path (Miniflare Worker, full suite) unchanged from before this script
# existed.
#
# Against a deployed environment, E2E_BASE_URL is set instead, which makes
# playwright.config.ts skip the local webServer/migrations and run only
# deployment-smoke.spec.ts against that URL — see that spec's header comment
# for what it does and doesn't prove, and scripts/verify-deployment.sh for
# the config-level checks this doesn't replace.
#
# --latest needs CLOUDFLARE_API_TOKEN (same token wrangler already uses).

set -uo pipefail

if [[ "${1:-}" == "staging" || "${1:-}" == "production" ]]; then
  ENVIRONMENT="$1"
  shift

  URL_ARG=""
  if [[ "${1:-}" == "--latest" || "${1:-}" == http* ]]; then
    URL_ARG="$1"
    shift
  fi

  source "$(dirname "${BASH_SOURCE[0]}")/lib/resolve-deployed-url.sh"

  BASE_URL=$(resolve_deployed_url "$ENVIRONMENT" "$URL_ARG") || exit 2
  echo "Testing: $BASE_URL"
  echo

  E2E_BASE_URL="$BASE_URL" exec npx playwright test --reporter=list "$@"
fi

exec npx playwright test --reporter=list "$@"
