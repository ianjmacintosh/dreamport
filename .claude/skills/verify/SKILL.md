---
name: verify
description: Drive the real dreamport web app (React SPA + Cloudflare Worker on local D1) in a private instance and capture proof that a change works — sign in, click through Products / Ideas / Journeys / account, read back D1 rows. Use before declaring any UI or Worker change done, to reproduce a bug in the running app, or whenever a playbook calls for the project's verification/driver skill.
---

# Verify dreamport

The surface is the browser app. Everything a user touches goes through
`/login` (email OTP) and then `/app/...`. This skill boots **its own**
Worker on port 5175, with a fresh D1 database and its own headless Chromium.
It never touches the human's dev server on 5173 or the e2e server on 5174.

All helpers live in `.claude/skills/verify/scripts/`. Run them from the
repo root. Each one sources `lib.sh`, which sets the ports, the paths, and the
`chrome-devtools-axi` environment. **Source `lib.sh` in every shell that
runs `chrome-devtools-axi`.** If you don't, the command attaches to the
`default` bridge, which belongs to someone else.

```bash
S=.claude/skills/verify/scripts
source $S/lib.sh
```

## Launch

```bash
$S/up.sh     # ~10s: wipes .wrangler/verify-state-5175, applies migrations, starts Vite + Chromium
```

The instance is ready when it prints
`ready: http://localhost:5175 (server pgid …, browser pgid …, CDP 9235)`.
If a launch fails, `up.sh` tears down whatever it started and prints the log
tail. Each process lives in its own process group, and the group ids are saved
in `.wrangler/verify-run-5175/{pid,chrome.pid}`. Logs are in
`.wrangler/verify-run-5175/{server,chrome,migrate}.log`.

`up.sh` refuses to start if its pid file is live, or if 5175 or 9235
already answers without being ours. Don't work around that by killing
something. Either run `down.sh`, if the instance is one you started, or run a
second isolated instance with
`export VERIFY_PORT=5176 VERIFY_CDP_PORT=9236` before sourcing `lib.sh`.
The state and run dirs are keyed by port, so the two instances share
nothing. Each helper reads those two variables, so export them in every
shell that drives the second instance. `lib.sh` names the axi session
`verify-<port>`, so each instance also gets its own bridge.

Prerequisite: `.dev.vars` exists (`cp .dev.vars.example .dev.vars`). Its
defaults are Cloudflare's always-pass Turnstile test secret, and mock email
mode, which sends no mail.

## Doctor

```bash
$S/doctor.sh   # read-only; exit 0 only when every line is "ok"
```

Doctor checks that the server group is alive, that port 5175 is owned by that
group, that `GET /` returns 200, that `GET /api/me` returns 401 when signed out
(the Worker is answering), that D1 holds every migration in `migrations/`, and
that Chromium answers on CDP. Run it first whenever anything looks off.

## Drive

The browser is driven with `chrome-devtools-axi`, attached through CDP to the
Chromium that `up.sh` launched. The system Chrome doesn't exist in this
devcontainer, so plain `chrome-devtools-axi open` fails without `lib.sh`.

**Start from `scripts/smoke.sh`.** It runs the whole loop and exits non-zero
at the first failed step: launch, sign in, add a Product, reload, check D1,
delete it, check D1, tear down. Run it to check the harness itself, and copy
its shape for a feature proof. Write multi-step drives as a script file with
`set -euo pipefail`. Pasting the steps into an interactive shell doesn't
reliably stop at a failure.

Helpers, each exiting non-zero with a message on failure:

| Helper | Does |
|---|---|
| `act.sh <verb> <role> "<name>" [value]` | Finds the element by its snapshot line `<role> "<name>"` (polling up to 10s) and runs `chrome-devtools-axi <verb> @uid [value]`. It retries when a re-render makes the ref stale. Verbs: `click`, `fill`, `hover`. |
| `wait.sh "<text>" [secs]` | Polls the accessibility snapshot until the text appears (30s by default). Use it instead of `chrome-devtools-axi wait`, which errors out when the page swaps content mid-wait. |
| `ref.sh <role> "<name>"` | Prints only the current `@uid`, for the axi commands `act.sh` doesn't wrap. |

On a miss, `act.sh`, `ref.sh` and `wait.sh` save the last snapshot to
`.wrangler/verify-run-<port>/last-miss.txt`.

- **Handles:** match accessible roles and names exactly as the snapshot
  prints them (see the feature files). Check where you are with
  `chrome-devtools-axi eval "location.pathname"`. Never use coordinates.
- **Refs:** a raw uid like `@g7:2_10` belongs to one snapshot generation
  and goes stale after the next command. Don't reuse one.
- **Repeated names:** `act.sh` takes the first match. When several rows each
  have a `Delete` button, read `chrome-devtools-axi snapshot` and use the uid
  listed after the target row's link.
- **Viewport:** the default is about 780px wide. For layout checks, run
  `chrome-devtools-axi resize 1280 800` and `chrome-devtools-axi resize 375 812`.

### Sign in (every feature starts here)

The code is always `000000` for an address that contains `+e2e-test@`
(`TEST_LOGIN_ENABLED=true` in the `local` env, docs/adr/0009). Use an address
on `resend.dev` that carries the marker, so no address can ever reach a real
inbox. For example `delivered+verify+e2e-test@resend.dev`, or
`delivered+verify-<thing>+e2e-test@resend.dev` when you need a second User.

```bash
chrome-devtools-axi open "$BASE_URL/login"
$S/wait.sh 'Success!'                         # Turnstile solved (always-pass test key)
$S/act.sh fill textbox 'Email address' 'delivered+verify+e2e-test@resend.dev'
$S/act.sh click button 'Send Code'
$S/wait.sh 'Six-digit code'                   # the first digit box is focused
chrome-devtools-axi type 000000               # the sixth digit auto-submits
$S/wait.sh 'Add Product'                      # on /app
```

The per-IP send limit is 3 per 60s, and the browser sends no
`cf-connecting-ip` header, so all of its sends share one bucket. Sign in once
per run and reuse the session. A 429 on Send Code means you hit the limit, not
that the app has a bug. To start clean, run `down.sh` then `up.sh` (it wipes
the rate-limit tables), or wait a minute.

## Evidence

Each run writes to `$EVIDENCE_DIR/<YYYYMMDD-HHMMSS>-<slug>/`, which is
`.wrangler/verify-evidence/…` (gitignored, and `down.sh` never deletes it).
Name files in order, for example:

```bash
E=$EVIDENCE_DIR/$(date +%Y%m%d-%H%M%S)-add-product; mkdir -p "$E"
chrome-devtools-axi screenshot "$E/01-before.png"
chrome-devtools-axi snapshot > "$E/02-after.snapshot.txt"   # text proof that grep can check
$S/db.sh "SELECT * FROM products" > "$E/03-db.json"          # side effect, read from D1
```

`db.sh "<SQL>"` runs one read-only query against this instance's D1 and
prints JSON. Use it only for reading. Create state through the UI. Column
names are camelCase in quotes (`"userId"`, `"createdAt"`). Check the
`migrations/` files before you write a query.

Proof standards:

- Drive the real user path: the same clicks and fields a user would use.
  Don't call `/api/...` directly or write rows to make the UI look right.
- Capture the action **and** the resulting state. Take a snapshot after the
  action, then `chrome-devtools-axi eval "location.reload()"`, then take
  another snapshot. A change that disappears on reload isn't saved.
- Check the side effect in D1 alongside what's visible.
- The only mock is the email sender, which is already the production
  boundary (mock mode). To read a delete-account link, use
  `curl -s "$BASE_URL/api/test/last-delete-link?email=<urlencoded>"`. That
  route exists only under `vite dev`.
- The user (Ian) can't see screenshots you take. Report what the evidence
  shows in words, with the file paths. If they need to look themselves,
  leave the instance up and give them `http://localhost:5175/<path>`.

## Cleanup

```bash
$S/down.sh
```

`down.sh` stops the `verify-<port>` axi bridge, sends TERM (then KILL) to the two
recorded process groups only, and deletes `.wrangler/verify-state-<port>`
and `.wrangler/verify-run-<port>`. Evidence stays. Never use `pkill -f vite`,
`pkill chrome`, or `killall node`. This machine routinely runs a human's dev
server and other sessions' axi bridges (session names like `default` and
`proto125`). Run `down.sh` after every failed attempt too.

## Features

`features/README.md` indexes every mapped user-facing feature and how to drive
it. A proof covers every entry point that the feature's file lists, not just
the convenient one. When the app changes, update the map in the same change,
or run `/maintain-verification-skill`.
