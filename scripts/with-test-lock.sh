#!/usr/bin/env bash
#
# Run a heavy local test command only once no other one holds the lock.
#
# Usage: scripts/with-test-lock.sh <command> [args...]
#
# Vitest (its pool spins up workerd instances) and the local Playwright run
# (Chromium against the dev server) each fit in the devcontainer's memory,
# but stacked on top of each other they don't: e2e plus two Vitest runs
# drove MemAvailable from ~3 GB to under 200 MB within 25 seconds, with swap
# already full — the devcontainer lockup in issue #150. Agents in separate
# sessions start these runs without knowing about each other, so the lock
# makes the second one wait its turn instead of stacking.
#
# The lock is an flock on a file in /tmp, shared by every checkout and
# worktree in the container. The kernel releases it when this script exits,
# however it exits, so a killed run never leaves it stuck.
#
# Watch mode (`vitest` on a terminal, outside CI, without `run`) skips the
# lock: it never exits, so holding the lock would block every other run for
# as long as the watcher stays open.

set -uo pipefail

LOCK_FILE="${DREAMPORT_TEST_LOCK:-/tmp/dreamport-heavy-tests.lock}"

is_vitest_watch() {
  [[ "${1:-}" == "vitest" && -t 1 && -z "${CI:-}" ]] || return 1
  shift
  local arg
  for arg in "$@"; do
    [[ "$arg" == "run" || "$arg" == "--run" ]] && return 1
  done
  return 0
}

if is_vitest_watch "$@"; then
  exec "$@"
fi

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Another test run holds $LOCK_FILE — waiting for it to finish…" >&2
  flock 9
fi

# This shell holds the lock; the command runs with fd 9 closed so none of
# its children (e.g. a workerd that outlives Vitest) inherit — and keep —
# the lock after the run itself has ended.
"$@" 9>&-
