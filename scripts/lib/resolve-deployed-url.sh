# Shared by verify-deployment.sh and e2e.sh: resolves what "staging" /
# "production" (+ an optional arg) means as an actual base URL.
#
# Production has one fixed host. Staging deliberately does not — every build
# uploads its own throwaway preview version (see docs/deployment.md) — so an
# explicit choice is required for anything precise: an exact preview URL, or
# --latest (the newest version on the Worker, which may not be what your most
# recent push produced if something else built more recently). A bare
# `staging` with no further arg resolves to the long-lived staging host
# instead of erroring — callers that need the stricter "no default" behavior
# (verify-deployment.sh) enforce that themselves before ever calling this.
#
# Usage: source this file, then call
#   resolve_deployed_url production
#   resolve_deployed_url staging                  # -> the long-lived host
#   resolve_deployed_url staging <preview-url>
#   resolve_deployed_url staging --latest [<known-version-id>]
#
# Prints the resolved URL on stdout and nothing else there, so
# `BASE_URL=$(resolve_deployed_url ...)` captures cleanly — informational and
# error text goes to stderr. Returns non-zero (with a stderr message) if
# --latest can't be resolved.
#
# The optional third arg lets a caller that has already looked up the latest
# version (verify-deployment.sh needs it anyway, for the Version bindings
# check) pass it through instead of this function querying it again.
resolve_deployed_url() {
  local environment="$1" url_arg="${2:-}" known_version_id="${3:-}"

  if [[ "$environment" == "production" ]]; then
    echo "https://dreamport.ianjmacintosh.com"
    return 0
  fi

  if [[ "$url_arg" == "--latest" ]]; then
    local version_id="$known_version_id"
    if [[ -z "$version_id" ]]; then
      local version_json
      version_json=$(npx wrangler versions list --name dreamport-staging --json 2>/dev/null || true)
      version_id=$(jq -r 'sort_by(.number) | last | .id // empty' <<<"$version_json")
    fi
    if [[ -z "$version_id" ]]; then
      echo "No versions found for dreamport-staging — can't resolve --latest." >&2
      return 1
    fi
    echo "--latest resolved to version $version_id (this may not be the version your most recent push produced — pass the exact preview URL to be sure)" >&2
    echo "https://${version_id:0:8}-dreamport-staging.bananasquad.workers.dev"
    return 0
  fi

  if [[ -z "$url_arg" ]]; then
    echo "https://dreamport-staging.bananasquad.workers.dev"
    return 0
  fi

  # Accept a full page URL (address-bar paste) and reduce it to scheme+host,
  # so ".../login" doesn't turn a smoke test into a POST to a nonsense path.
  sed -E 's#^(https?://[^/]+).*#\1#' <<<"$url_arg"
}
