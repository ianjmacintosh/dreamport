import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";
import { Kysely } from "kysely";
import { D1Dialect } from "kysely-d1";

import { createEmailSender, type EmailSender } from "./email/sender";
import type { WorkerEnv } from "./env";
import { ALLOWED_HOSTS, TRUSTED_ORIGINS } from "./trusted-origins";

/** Seconds in a minute / day, for the time configs below. */
const MINUTE = 60;
const DAY = 24 * 60 * MINUTE;

/**
 * Overrides for {@link createAuth}. `emailSender` lets a test drive the auth
 * object with a spy sender directly, without going through `EMAIL_MODE` or the
 * shared mock (see `src/worker/index.worker.test.ts`, "uses an injected email
 * sender"). The Worker itself never passes this.
 */
export interface AuthDeps {
  emailSender?: EmailSender;
}

/**
 * Builds the `generateOTP` callback for the `emailOTP` plugin below: a fixed
 * test-login code (`"000000"`) for any `+e2e-test@` address, so Playwright
 * specs can sign in without a real inbox (issue #39, docs/adr/0009).
 *
 * The return type is deliberately a plain function, never
 * `((...) => ...) | undefined` — Better Auth's `email-otp` routes call
 * `opts.generateOTP(...)` unconditionally, with no `?.` guard, so
 * `generateOTP` itself must never be `undefined` or every OTP send (sign-in
 * included) throws instead of just skipping the fixed code. That's exactly
 * what shipped in #61: `generateOTP: import.meta.env.DEV ? fn : undefined`
 * made the whole property `undefined` in a real production build, and no
 * test caught it because `import.meta.env.DEV` is a build-time constant —
 * always `true` in the Vitest and Playwright pools, so the crashing branch
 * is structurally unreachable by any test that isn't itself an alternate
 * build. Extracting this as its own function (always returning a function,
 * enforced by the signature) and gating *inside* it with `TEST_LOGIN_ENABLED`
 * — a runtime var, not a build-time flag — makes the "off" behavior directly
 * testable with a plain unit test instead.
 *
 * `env.TEST_LOGIN_ENABLED` is `"true"` only in `wrangler.jsonc`'s `local` and
 * `dev` envs, absent (falsy) everywhere else — `staging` included, since it's
 * `workers_dev: true` (a public *.workers.dev URL). `EMAIL_MODE=mock` alone
 * isn't a sufficient gate on its own: `staging` runs it too. `EMAIL_MODE`
 * still gets checked as well, as defense in depth for a `vite dev` server
 * someone points at a real `RESEND_API_KEY`.
 *
 * Applies to all four OTP types — sign-in, email-verification,
 * forget-password, change-email — since callers never special-case on
 * `type`. Falls through to Better Auth's own random generator on a falsy
 * return; the returned code still goes through `storeOTP`/`verifyStoredOTP`
 * like any other, so attempts/expiry/single-use all still apply. Exported
 * for direct unit testing (`auth.test.ts`), independent of `createAuth`'s D1
 * and Better Auth wiring.
 */
export function buildTestLoginOTP(
  env: WorkerEnv,
): (data: { email: string }) => string | undefined {
  return ({ email }) => {
    if (env.TEST_LOGIN_ENABLED !== "true") return undefined;
    if ((env.EMAIL_MODE ?? "mock") === "resend") return undefined;
    if (!email.toLowerCase().includes("+e2e-test@")) return undefined;
    return "000000";
  };
}

/**
 * Build the auth object (the bundle of functions `betterAuth()` returns) for
 * each request.
 *
 * We don't build it once at app startup and reach back into it later. To
 * build it we need the DB binding and the signing secret, and on Workers
 * those only arrive with a request, on `c.env`. No request, no `env` — so
 * we build the auth object fresh on every request instead.
 *
 * Better Auth is hand-wired to D1 through Kysely + the `kysely-d1` dialect
 * rather than the `better-auth-cloudflare` bundle, to keep the code we own
 * and audit small (see `docs/adr/0002-better-auth-over-homegrown.md`).
 *
 * Note: D1 has no transactions and Better Auth assumes them, so a
 * multi-statement write can partially apply. Accepted risk, same ADR.
 */
export function createAuth(env: WorkerEnv, deps: AuthDeps = {}) {
  // Fail loud, not quiet: without a secret Better Auth would fall back to a
  // shared default and sign real cookies with it. Locally that means copying
  // `.dev.vars.example` to `.dev.vars`; deployed it means the Cloudflare
  // secret is missing.
  if (!env.BETTER_AUTH_SECRET) {
    throw new Error(
      "BETTER_AUTH_SECRET is not set — copy .dev.vars.example to .dev.vars " +
        "for local dev, or set the Cloudflare secret (see docs/deployment.md).",
    );
  }

  const db = new Kysely({
    dialect: new D1Dialect({ database: env.DB }),
  });

  // An injected sender wins (see AuthDeps); otherwise `EMAIL_MODE` picks the
  // implementation, and `createEmailSender` throws if `resend` is only
  // half-configured.
  const emailSender = deps.emailSender ?? createEmailSender(env);

  return betterAuth({
    database: { db, type: "sqlite" },
    secret: env.BETTER_AUTH_SECRET,
    basePath: "/api/auth",
    // A dynamic config, not a fixed string: `stage` has no one fixed host
    // (see ALLOWED_HOSTS) and `local`'s port floats. Without this Better
    // Auth resolves baseURL by trusting whatever Host the request itself
    // claims — allowedHosts makes that an explicit allowlist instead, and a
    // request whose Host matches nothing in it fails rather than
    // self-trusting.
    baseURL: { allowedHosts: ALLOWED_HOSTS },
    trustedOrigins: TRUSTED_ORIGINS,
    session: {
      // Rolling 30-day session, bumped at most once a day of activity.
      expiresIn: 30 * DAY,
      updateAge: 1 * DAY,
    },
    user: {
      // Account deletion (issue #26). `enabled` turns on `/delete-user` and
      // `/delete-user/callback`; supplying `sendDeleteAccountVerification`
      // makes the first call email a confirmation link instead of deleting
      // straight away. Better Auth 1.7.2 skips the session-freshness check on
      // that branch (it `return`s before it), so a weeks-old rolling session
      // still starts the flow; the callback then requires the same
      // still-signed-in browser and a token bound to this user's id.
      deleteUser: {
        enabled: true,
        sendDeleteAccountVerification: async ({ user, url }) => {
          await emailSender.sendDeleteAccountVerification({
            to: user.email,
            url,
          });
        },
        // No `beforeDelete` yet: the Private space is still empty. When
        // Products exist, cascade-delete them here.
      },
    },
    advanced: {
      // The session cookie is always `Secure` (spec #18). Without this,
      // Better Auth only marks it `Secure` when it can prove the request
      // origin is HTTPS, which it can't do reliably behind Cloudflare or in
      // the Workers test pool. No `crossSubDomainCookies`, so it stays
      // host-only (no `Domain`) — every preview origin gets its own login.
      // Local dev must be reached over `http://localhost` (a secure context,
      // so browsers still store the cookie), not a bare LAN IP.
      useSecureCookies: true,
      ipAddress: {
        // Rate limiting (below) keys on the client IP. Cloudflare sets
        // `cf-connecting-ip` to the real client address on every request;
        // Better Auth defaults to `x-forwarded-for`, which is not what the
        // edge populates here. When the header is absent (local dev, the
        // test pool) Better Auth falls back to a single shared bucket.
        ipAddressHeaders: ["cf-connecting-ip"],
      },
    },
    // Availability control on the send-OTP path (issue #24, ADR-0007). This
    // is the per-IP dimension; the per-email dimension is owned code in the
    // Hono send route (`otp-send-throttle.ts`), since this limiter never sees
    // the request body.
    rateLimit: {
      // `enabled` defaults to production-only via `NODE_ENV`, which Workers
      // does not set — so without this the limiter is off everywhere.
      enabled: true,
      // Persist counters in D1 (the `rateLimit` table, migration 0002) so the
      // limit holds across isolates and requests, not just within one.
      storage: "database",
      // The global default (10s / 100) stays generous — only the send path is
      // deliberately tightened. 3 / 60s matches Better Auth's own built-in
      // rule for this endpoint; pinning it here makes the intent explicit and
      // survives an upstream default change.
      customRules: {
        "/email-otp/send-verification-otp": { window: 60, max: 3 },
        // The account-deletion request path also sends an email (issue #26).
        // 3 / 60s per IP/session, matching the send-OTP rule; the global
        // daily Resend cap covers it too, in the Hono route in `index.ts`.
        "/delete-user": { window: 60, max: 3 },
        // #24 is scoped to the send path. Turning the limiter on globally
        // would otherwise pull Better Auth's default 3 / 10s `/sign-in*` rule
        // onto the verify endpoint as a side effect; `false` opts that path
        // out so verify-path behaviour is unchanged (the verify-path
        // griefing mitigation is issue #46).
        "/sign-in/email-otp": false,
      },
    },
    plugins: [
      // `better-auth` is pinned exactly in package.json: 1.7.2 verifies a
      // submitted code before looking the User up (PR #10605), so `verify`
      // can't be used to probe which emails exist. Any bump must keep that.
      // Full reasoning in docs/adr/0002-better-auth-over-homegrown.md.
      emailOTP({
        // 6-digit numeric code, 60-minute life, 3 guesses then it is dead.
        otpLength: 6,
        expiresIn: 60 * MINUTE,
        allowedAttempts: 3,
        // Sending to an unknown address does not reveal that it is unknown;
        // the address becomes a User when a code is verified, not before
        // (see docs/adr/0004-email-otp-no-pending-user.md).
        disableSignUp: false,
        // Hash the code at rest in `verification.value` rather than storing
        // it plain (issue #39, docs/adr/0009). No migration: that column is
        // already a generic `value text`, so this just changes what string
        // lands in it. No rollout handling either — an OTP mid-flight at
        // deploy time (sent plain, checked against the new hashed compare)
        // just fails to verify, bounded by the 60-minute TTL above, and
        // self-heals the moment the user requests a fresh code.
        storeOTP: "hashed",
        // See `buildTestLoginOTP` above for the fixed-test-code mechanism and
        // why it's built as its own function rather than inlined here.
        generateOTP: buildTestLoginOTP(env),
        async sendVerificationOTP({ email, otp, type }) {
          await emailSender.sendOtp({ to: email, otp, type });
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
