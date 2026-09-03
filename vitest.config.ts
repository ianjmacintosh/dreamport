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
    },
  },
});
