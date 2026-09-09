import type { WorkerEnv } from "./env";

/**
 * dreamport-owned rate limiting for the send-OTP path (issue #24), the part
 * Better Auth's own limiter (see `rateLimit` in `auth.ts`) can't do. Two
 * concerns, full rationale in `docs/adr/0007-send-otp-rate-limiting.md`:
 *
 *  - **Per target email** — Better Auth's limiter keys on IP + path and never
 *    reads the request body, so one address being flooded with codes from a
 *    spread of IPs is ours to stop. Fixed window per normalised address.
 *
 *  - **Global daily cap** — neither a per-IP nor a per-email limit protects
 *    the shared Resend send quota: an attacker sprays one code each across
 *    many addresses and trips neither. A single app-wide counter per UTC day
 *    is the only thing that does.
 *
 * Each is split into a read (`peek*`, before Better Auth's handler) and a
 * write (`record*`, only after a code actually went out) so a send that Better
 * Auth's per-IP limiter or a transient failure rejects doesn't spend budget.
 */

/** Fixed window for the per-email limiter. Exported for the Seam 1 tests. */
export const WINDOW_MS = 10 * 60 * 1000;

/** Sends counted for one email within a window before it is throttled. */
const MAX_PER_WINDOW = 5;

/** Fallback for `SEND_OTP_DAILY_CAP` when unset / non-numeric / ≤ 0. */
export const DEFAULT_DAILY_CAP = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ThrottleStatus {
  allowed: boolean;
  /**
   * Whole seconds until the relevant window resets. Only meaningful when
   * `allowed` is `false`; `0` otherwise.
   */
  retryAfter: number;
}

interface ThrottleRow {
  count: number;
  windowStart: number;
}

/** The UTC calendar day (`YYYY-MM-DD`) that `now` falls in. */
function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Whole seconds from `now` until the next UTC midnight (at least 1). */
function secondsToNextUtcMidnight(now: number): number {
  const d = new Date(now);
  const nextMidnight = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() + 1,
  );
  return Math.max(Math.ceil((nextMidnight - now) / 1000), 1);
}

/**
 * Resolve the configured global daily cap. `SEND_OTP_DAILY_CAP` is a plain
 * env var (string); anything not a positive integer falls back to
 * {@link DEFAULT_DAILY_CAP}.
 */
export function resolveDailyCap(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_DAILY_CAP;
}

/**
 * Report whether `email` still has send budget in the current window,
 * **without** spending any. Call this before handing off to Better Auth; a
 * `false` result should short-circuit with a 429.
 *
 * `email` must already be normalised (trimmed, lower-cased) by the caller —
 * the same normalisation Better Auth applies — so both limiters key on the
 * same string. `now` is injectable for tests; production uses the default.
 */
export async function peekOtpSendBudget(
  db: WorkerEnv["DB"],
  email: string,
  now: number = Date.now(),
): Promise<ThrottleStatus> {
  const row = await db
    .prepare(
      `SELECT "count", "windowStart" FROM "otpSendThrottle" WHERE "email" = ?1`,
    )
    .bind(email)
    .first<ThrottleRow>();

  if (!row) return { allowed: true, retryAfter: 0 };

  const windowActive = now - row.windowStart < WINDOW_MS;
  if (windowActive && row.count >= MAX_PER_WINDOW) {
    const secondsLeft = Math.ceil((row.windowStart + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfter: Math.max(secondsLeft, 1) };
  }
  return { allowed: true, retryAfter: 0 };
}

/**
 * Count one *successful* send for `email` against the fixed window.
 *
 * The upsert is a single `INSERT … ON CONFLICT DO UPDATE`, atomic on D1
 * despite the no-transactions constraint (ADR-0002). Every reference in the
 * `DO UPDATE` clause is to the pre-update row, so the window check and the
 * reset see the same `windowStart`. Concurrent successful sends for one
 * address can still overshoot the limit by a request or two before the row
 * locks — acceptable for an availability control.
 *
 * Also opportunistically drops rows whose window has fully elapsed, so the
 * table stays bounded. Better Auth's own `rateLimit` table self-prunes; this
 * one has no background job, and the send path is low-traffic (it is rate
 * limited), so an extra `DELETE` per send is cheap next to the Turnstile
 * round trip that precedes it.
 */
export async function recordOtpSend(
  db: WorkerEnv["DB"],
  email: string,
  now: number = Date.now(),
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO "otpSendThrottle" ("email", "count", "windowStart")
       VALUES (?1, 1, ?2)
       ON CONFLICT ("email") DO UPDATE SET
         "count" = CASE
           WHEN ?2 - "windowStart" >= ?3 THEN 1
           ELSE "count" + 1
         END,
         "windowStart" = CASE
           WHEN ?2 - "windowStart" >= ?3 THEN ?2
           ELSE "windowStart"
         END`,
    )
    .bind(email, now, WINDOW_MS)
    .run();

  await db
    .prepare(`DELETE FROM "otpSendThrottle" WHERE "windowStart" < ?1`)
    .bind(now - WINDOW_MS)
    .run();
}

/**
 * Report whether the app-wide send count for the current UTC day is still
 * under `cap`, **without** spending any. A `false` result should
 * short-circuit with a 429; `retryAfter` counts down to the next UTC
 * midnight, when the day's row rolls over.
 */
export async function peekDailySendCap(
  db: WorkerEnv["DB"],
  cap: number,
  now: number = Date.now(),
): Promise<ThrottleStatus> {
  const row = await db
    .prepare(`SELECT "count" FROM "otpSendDaily" WHERE "day" = ?1`)
    .bind(utcDay(now))
    .first<{ count: number }>();

  if ((row?.count ?? 0) >= cap) {
    return { allowed: false, retryAfter: secondsToNextUtcMidnight(now) };
  }
  return { allowed: true, retryAfter: 0 };
}

/**
 * Count one *successful* send against the global daily cap: bump today's UTC
 * row, then drop rows older than yesterday so the table holds at most a
 * couple of days. Concurrent sends can overshoot `cap` by a handful before
 * the count catches up — the cap is sized with headroom under the real quota
 * for exactly that.
 */
export async function recordDailySend(
  db: WorkerEnv["DB"],
  now: number = Date.now(),
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO "otpSendDaily" ("day", "count") VALUES (?1, 1)
       ON CONFLICT ("day") DO UPDATE SET "count" = "count" + 1`,
    )
    .bind(utcDay(now))
    .run();

  await db
    .prepare(`DELETE FROM "otpSendDaily" WHERE "day" < ?1`)
    .bind(utcDay(now - 2 * DAY_MS))
    .run();
}
