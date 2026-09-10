import { createAuthClient } from "better-auth/client";
import { emailOTPClient } from "better-auth/client/plugins";

/**
 * The browser-side Better Auth client. Same-origin, so no `baseURL` — it
 * resolves to `window.location.origin` + the default `/api/auth` base path,
 * which is where the Worker mounts Better Auth (`src/worker/auth.ts`).
 *
 * The `emailOTPClient()` plugin is what teaches this client the
 * `emailOtp.sendVerificationOtp` / `signIn.emailOtp` actions used by
 * `/login`. `authClient.signOut()` and `authClient.deleteUser()` (used by
 * `/app`, issue #26) are core client methods — they need no plugin. Nothing
 * else belongs in this file: it is wiring, not logic.
 */
export const authClient = createAuthClient({
  plugins: [emailOTPClient()],
});
