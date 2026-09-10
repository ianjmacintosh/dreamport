import { defineConfig } from "vitest/config";

// Two suites, run together by `npm run test:unit`:
//   - unit    — plain Vitest for components and pure modules
//   - workers — Seam 1: the Worker's fetch handler driven inside workerd
//               with real bindings (see vitest.workers.config.ts)
export default defineConfig({
  test: {
    projects: ["./vitest.unit.config.ts", "./vitest.workers.config.ts"],
    // Better Auth 1.7.2 turns a rejected email-OTP verification into a normal
    // HTTP response — the Seam 1 tests assert the resulting 4xx and pass — but
    // routes that path through `AsyncLocalStorage.run()`, which returns the
    // already-rejected promise one microtask before the outer `.catch` adopts
    // it. workerd's rejection tracker reports that transient gap even though
    // the rejection is handled.
    //
    // Ignore *only* that: an `APIError` whose code is one of the three the
    // `emailOTP` verify endpoint raises, thrown from inside the plugin. Any
    // other unhandled error — including a 500 from the D1 "no transactions"
    // hazard, or an `APIError` from any other route — still fails the run.
    //
    // Must live on the root config; a `projects[].test.onUnhandledError` is
    // not consulted for rejections surfaced by the pool-workers project.
    onUnhandledError(error) {
      const e = error as {
        name?: string;
        body?: { code?: string };
        statusCode?: number;
        errorStack?: unknown;
      };
      const verifyErrorCodes = [
        "INVALID_OTP",
        "OTP_EXPIRED",
        "TOO_MANY_ATTEMPTS",
      ];
      const isHandledEmailOtpRejection =
        e.name === "APIError" &&
        !!e.body?.code &&
        verifyErrorCodes.includes(e.body.code) &&
        typeof e.errorStack === "string" &&
        e.errorStack.includes("email-otp");

      if (isHandledEmailOtpRejection) return false;

      // The account-deletion flow (issue #26) hits the same workerd quirk:
      // Better Auth's `/delete-user` + `/delete-user/callback` use a thrown
      // `APIError` for control flow — a 302 redirect on a completed deletion,
      // a 404 when the browser is no longer signed in or the token is stale —
      // and the tracker catches the transient gap before the outer handler
      // adopts it. The "delete account" Seam 1 cases assert each outcome as a
      // normal HTTP response. Scoped tight: only from `update-user.mjs` (where
      // both routes live), only the 302/404 it raises by design. Like the
      // clause above, this string-matches a compiled path inside `better-auth`
      // — safe only because the version is pinned exactly (1.7.2, see
      // `package.json` / ADR-0002); revisit on any bump.
      const isHandledDeleteUserRejection =
        typeof e.errorStack === "string" &&
        e.errorStack.includes("routes/update-user.mjs") &&
        (e.statusCode === 302 || e.statusCode === 404);

      if (isHandledDeleteUserRejection) return false;
    },
  },
});
