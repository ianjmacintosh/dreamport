# Send-OTP rate limiting is two mechanisms: Better Auth's limiter per IP, dreamport code per email

Issue #24 asks for the send-OTP endpoint to stay available under abuse, keyed
on **both** client IP and target email. Better Auth 1.7.2's own rate limiter
covers one of those dimensions but structurally cannot cover the other, so the
feature is split.

## The split

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

## Considered Options

- **Reuse Better Auth's `rateLimit` table for the per-email counter too**,
  writing rows with a `email-otp-send:<addr>` key from our own code. Rejected:
  that table's row semantics are Better Auth's internal contract and could
  shift on an upgrade. A separate owned table keeps our writes off a surface
  we do not control.
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
  mitigation (a non-consuming cooldown, or forking the plugin) is a separate
  open issue; ADR-0005 stays the standing accepted-risk record.
- **Residual on the send path**: an attacker with many emails _and_ many IPs
  still gets volume through — each (IP, email) pair has its own budget. #38
  (live-email cutover) has to weigh that against real Resend quota before
  turning on real delivery.
- Turning the limiter on globally would have pulled Better Auth's default
  `3 / 10s` `/sign-in*` rule onto the verify endpoint as a side effect.
  `customRules["/sign-in/email-otp"]: false` opts that path out, so verify
  behaviour is unchanged by this change.
- When `cf-connecting-ip` is absent (local dev, the test pool) Better Auth
  falls back to a single shared per-path bucket — so local `npm run dev`
  hits the `3 / 60s` send-path limit after three sign-ins in a minute, and
  the Playwright suite shares one budget across specs (a genuine failure plus
  CI retries can produce secondary 429s). `index.worker.test.ts` and
  `rate-limit.worker.test.ts` clear both tables in `beforeEach` so their
  multi-send cases start from a full budget.
- `scripts/verify-deployment.sh`'s live smoke test now treats a `429` from
  the send endpoint as healthy (gate + limiter both live), since re-running
  it on staging can trip the limit for its fixed test address.
- Migration `0002` must reach staging and production with this deploy — the
  send path reads both tables on every request once the code is live (see
  `docs/deployment.md`).
- The 429 from the owned limiter carries `Retry-After` and an `{ error }`
  body, matching this route's other responses. Better Auth's own 429 uses
  `X-Retry-After` and a `{ message }` body; a client sees a 429 from either
  and should back off regardless.
