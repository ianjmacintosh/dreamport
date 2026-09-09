# Send-OTP rate limiting is three limits: per IP, per email, and a global daily cap

Issue #24 asks for the send-OTP endpoint to stay available under abuse, keyed
on **both** client IP and target email. Better Auth 1.7.2's own rate limiter
covers the per-IP dimension but structurally cannot cover per-email, and
neither dimension protects the shared Resend send quota — an attacker who
sprays one code each across many addresses trips no per-IP or per-email limit.
So there are three limits, checked in that order (cheapest first).

## The three limits

**Per IP — Better Auth's DB-backed limiter.** `auth.ts` sets `rateLimit: {
enabled: true, storage: "database", customRules }`. `enabled` has to be
explicit: it defaults to production-only via `NODE_ENV`, which Workers never
sets, so the limiter is otherwise off in every environment. `storage:
"database"` persists counters in the `rateLimit` table (migration `0002`) so a
limit holds across isolates. The send path is pinned to `3 / 60s` via
`customRules["/email-otp/send-verification-otp"]` — the same value Better Auth
already ships as a built-in rule for this endpoint, restated so the intent is
visible and survives an upstream default change. IP comes from
`advanced.ipAddress.ipAddressHeaders: ["cf-connecting-ip"]` (Better Auth
defaults to `x-forwarded-for`, which Cloudflare's edge does not populate).

**Per email — owned code.** Better Auth's limiter keys on IP + path and never
reads the request body, so it cannot see the address a code is being sent to.
The per-email dimension is therefore `src/worker/otp-send-throttle.ts`, called
from the Hono send route after the Turnstile gate. Fixed window, `5 / 10min`
per normalised address, one row per email in the dreamport-owned
`otpSendThrottle` table.

It is split into `peekOtpSendBudget` (a read, before Better Auth's handler)
and `recordOtpSend` (an `INSERT … ON CONFLICT DO UPDATE`, only after the
handler returns `200`). Spending the budget only on a _successful_ send means
a request that Better Auth's per-IP limiter rejects — or a transient 5xx —
doesn't burn the address's quota, so a shared NAT that exhausts the per-IP
bucket can't lock a real user out of the email dimension. The trade is a
check-then-write race: concurrent successful sends for one address can
overshoot the limit by a request or two before the row locks. `recordOtpSend`
also prunes rows whose window has elapsed, since — unlike Better Auth's
`rateLimit` table — nothing else does.

**Global daily cap — the Resend-quota guard.** One app-wide counter per UTC
day in the owned `otpSendDaily` table (`day` PK, `count`). `peekDailySendCap`
runs first in the route — before the body is even read — and 429s once the
day's count reaches `SEND_OTP_DAILY_CAP` (`resolveDailyCap`, default
`DEFAULT_DAILY_CAP` = **90**); `recordDailySend` bumps it, again only on a
`200`, and prunes rows older than yesterday. Sized for Resend's free tier
(100/day, 3000/month): 90/day ⇒ ≤ 2790/month, both under the ceiling with
headroom for the check-then-write overshoot. Raise it per environment as a
plain `wrangler.jsonc` var when the plan grows.

## Considered Options

- **Reuse Better Auth's `rateLimit` table for the owned counters too**,
  writing rows with our own keys. Rejected: that table's row semantics are
  Better Auth's internal contract and could shift on an upgrade. Separate
  owned tables keep our writes off a surface we do not control.
- **Skip the global cap; tighten per-IP and per-email instead.** Rejected:
  neither axis protects the quota. A per-IP limit strict enough to matter
  (the quota is 100/day; one IP at 3/60s is 4,320/day) would break real use,
  and per-email does nothing against a spray across many addresses. Only an
  app-wide count works.
- **A monthly cap as well as daily.** Unnecessary — a 90/day cap already
  bounds the month at ≤ 2790, under Resend's 3000.
- **`customRules` function form** — a `(request, rule) => ...` callback can
  inspect the request, but it can only return a `{ window, max }`; it cannot
  change the key Better Auth limits on, so it still buckets per IP.
- **`emailOTP({ rateLimit })`** — a plugin-level lever for the OTP endpoints.
  Still keys on IP, so it is another per-IP knob, not the email dimension.
- **A sliding window or token bucket.** Overkill here. Fixed window matches
  Better Auth's own approach and is enough to stop volume.

## Consequences

- **This does not fix ADR-0005.** That vector is 3 requests per cycle against
  the _verify_ endpoint; any limit loose enough for real users still lets it
  through, and an attacker rotating IPs is unaffected. #24 is an availability
  control on the _send_ path, nothing more. A dedicated verify-path
  mitigation (a non-consuming cooldown, or forking the plugin) is issue #46;
  ADR-0005 stays the standing accepted-risk record until then.
- **The global cap is a real availability ceiling, not just an attacker
  control.** A genuine spike — dreamport gets posted somewhere, 90+ people
  try to sign in the same UTC day — hits the cap and every further sign-in
  429s until 00:00 UTC. Pre-launch (one user) that is remote; the cap is an
  env var precisely so it can be raised ahead of a known spike or a plan
  upgrade. It fails _closed_: the shared quota being exhausted would lock
  everyone out too, and also cost money / bounce silently.
- **Residual**: an attacker still burns the whole day's quota (90 sends)
  cheaply once per day — griefing the sign-in path for everyone until
  midnight, for the price of 90 Turnstile solves. #38 (live-email cutover)
  should decide whether that is acceptable or whether it wants alerting /
  a lower cap / a paid Resend tier with room to raise it.
- Turning the limiter on globally would have pulled Better Auth's default
  `3 / 10s` `/sign-in*` rule onto the verify endpoint as a side effect.
  `customRules["/sign-in/email-otp"]: false` opts that path out, so verify
  behaviour is unchanged by this change.
- When `cf-connecting-ip` is absent (local dev, the test pool) Better Auth
  falls back to a single shared per-path bucket — so local `npm run dev`
  hits the `3 / 60s` send-path limit after three sign-ins in a minute, and
  the Playwright suite shares one budget across specs (a genuine failure plus
  CI retries can produce secondary 429s). `index.worker.test.ts` and
  `rate-limit.worker.test.ts` clear all three tables in `beforeEach` so their
  multi-send cases start from a full budget.
- `scripts/verify-deployment.sh`'s live smoke test now treats a `429` from
  the send endpoint as healthy (gate + limiter both live), since re-running
  it on staging can trip the per-email or daily limit.
- Migration `0002` must reach staging and production with this deploy — the
  send path reads all three tables on every request once the code is live
  (see `docs/deployment.md`). `0002` had not been applied anywhere when the
  `otpSendDaily` table was added to it, so it was edited in place; a local
  D1 that already ran the two-table version needs its `d1_migrations` row for
  `0002` cleared and the migration re-applied.
- The 429s carry `Retry-After` and an `{ error }` body, matching this route's
  other responses. Better Auth's own 429 uses `X-Retry-After` and a
  `{ message }` body; a client sees a 429 from any of the three and should
  back off regardless.
