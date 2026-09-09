import { createAuthClient } from "better-auth/client";
import { emailOTPClient } from "better-auth/client/plugins";

/**
 * The browser-side Better Auth client. Same-origin, so no `baseURL` — it
 * resolves to `window.location.origin` + the default `/api/auth` base path,
 * which is where the Worker mounts Better Auth (`src/worker/auth.ts`).
 *
 * The `emailOTPClient()` plugin is what teaches this client the
 * `emailOtp.sendVerificationOtp` / `signIn.emailOtp` actions used by
 * `/login`. Nothing else belongs in this file: it is wiring, not logic.
 */
export const authClient = createAuthClient({
  plugins: [emailOTPClient()],
});
