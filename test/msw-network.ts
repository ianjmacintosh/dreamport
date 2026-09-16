import { setupNetwork } from "@msw/cloudflare";
import { afterAll, afterEach, beforeAll } from "vitest";

/**
 * MSW network interception for the Seam 1 (workers-pool) suite (issue #66,
 * docs/adr/0010). `vi.spyOn(globalThis, "fetch")` can't reach a `fetch` call
 * made from inside workerd — the Worker under test runs in its own isolate,
 * not this process — so the real `ResendEmailSender` send path (request
 * construction, response parsing, error handling) was untestable in the
 * workers pool until now. `setupNetwork` intercepts at the workerd level
 * instead, letting a test stub Resend's response and drive the real code
 * path with no real network call and no real `RESEND_API_KEY`.
 *
 * Enabled for every `*.worker.test.ts` file via `vitest.workers.config.ts`'s
 * `setupFiles`. A test file that never calls {@link network}.use() sees no
 * behavior change — an unhandled request just falls through as it always
 * did.
 */
export const network = setupNetwork();

beforeAll(() => {
  network.enable();
});

afterEach(() => {
  network.resetHandlers();
});

afterAll(() => {
  network.disable();
});
