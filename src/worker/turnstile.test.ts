import { afterEach, describe, expect, it, vi } from "vitest";

import { verifyTurnstile } from "./turnstile";

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** One recorded `fetch` call: `[url, init]`. */
type FetchCall = [string, RequestInit | undefined];

/** Stub `fetch` with a canned `siteverify` response and hand back the spy. */
function stubFetch(response: {
  ok?: boolean;
  body?: unknown;
  reject?: boolean;
}) {
  const fn = vi.fn(async (): Promise<Response> => {
    if (response.reject) throw new Error("network down");
    return {
      ok: response.ok ?? true,
      json: async () => response.body ?? { success: true },
    } as Response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** The arguments `fetch` was called with on call `n` (default: the first). */
function fetchCall(fn: ReturnType<typeof stubFetch>, n = 0): FetchCall {
  return fn.mock.calls[n] as unknown as FetchCall;
}

/** The base options — a plain success check, no action/hostname pinning. */
const base = { secret: "s", token: "tok", remoteIp: null };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("verifyTurnstile", () => {
  it("returns true when siteverify reports success", async () => {
    stubFetch({ body: { success: true } });

    expect(await verifyTurnstile(base)).toBe(true);
  });

  it("returns false when siteverify reports failure", async () => {
    stubFetch({
      body: { success: false, "error-codes": ["invalid-input-response"] },
    });

    expect(await verifyTurnstile(base)).toBe(false);
  });

  it("returns false without calling siteverify for a missing or oversized token", async () => {
    const fn = stubFetch({ body: { success: true } });

    expect(await verifyTurnstile({ ...base, token: null })).toBe(false);
    expect(await verifyTurnstile({ ...base, token: "" })).toBe(false);
    expect(await verifyTurnstile({ ...base, token: "x".repeat(2049) })).toBe(
      false,
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it("fails closed when siteverify errors or returns non-2xx", async () => {
    stubFetch({ reject: true });
    expect(await verifyTurnstile(base)).toBe(false);

    stubFetch({ ok: false, body: { success: true } });
    expect(await verifyTurnstile(base)).toBe(false);
  });

  it("form-encodes the secret, token, and client IP to the siteverify endpoint", async () => {
    const fn = stubFetch({ body: { success: true } });

    await verifyTurnstile({
      secret: "the-secret",
      token: "the-token",
      remoteIp: "203.0.113.7",
    });

    expect(fn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchCall(fn);
    expect(url).toBe(SITEVERIFY_URL);
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["content-type"]).toBe(
      "application/x-www-form-urlencoded",
    );
    const params = new URLSearchParams(init?.body as URLSearchParams);
    expect(Object.fromEntries(params)).toEqual({
      secret: "the-secret",
      response: "the-token",
      remoteip: "203.0.113.7",
    });
  });

  it("omits remoteip when no client IP is available", async () => {
    const fn = stubFetch({ body: { success: true } });

    await verifyTurnstile(base);

    const [, init] = fetchCall(fn);
    const params = new URLSearchParams(init?.body as URLSearchParams);
    expect(Object.fromEntries(params)).toEqual({
      secret: "s",
      response: "tok",
    });
  });

  describe("action pinning", () => {
    it("passes when the response action matches expectedAction", async () => {
      stubFetch({ body: { success: true, action: "send-otp" } });

      expect(
        await verifyTurnstile({ ...base, expectedAction: "send-otp" }),
      ).toBe(true);
    });

    it("fails when the response action does not match", async () => {
      stubFetch({ body: { success: true, action: "signup" } });

      expect(
        await verifyTurnstile({ ...base, expectedAction: "send-otp" }),
      ).toBe(false);
    });

    it("ignores the action when expectedAction is not given", async () => {
      stubFetch({ body: { success: true, action: "anything" } });

      expect(await verifyTurnstile(base)).toBe(true);
    });
  });

  describe("hostname pinning", () => {
    it("passes when the response hostname is in the allowlist", async () => {
      stubFetch({ body: { success: true, hostname: "dreamport.example.com" } });

      expect(
        await verifyTurnstile({
          ...base,
          allowedHostnames: ["other.example.com", "dreamport.example.com"],
        }),
      ).toBe(true);
    });

    it("fails when the response hostname is not in the allowlist", async () => {
      stubFetch({ body: { success: true, hostname: "evil.example.com" } });

      expect(
        await verifyTurnstile({
          ...base,
          allowedHostnames: ["dreamport.example.com"],
        }),
      ).toBe(false);
    });

    it("ignores the hostname when the allowlist is empty", async () => {
      stubFetch({ body: { success: true, hostname: "anything.example.com" } });

      expect(await verifyTurnstile({ ...base, allowedHostnames: [] })).toBe(
        true,
      );
    });

    // #69: the allowlist is now this environment's own trusted-host
    // patterns (e.g. `STAGING_HOSTS`'s `*-dreamport-staging....` entry),
    // matched wildcard-aware rather than by exact `Array.includes`.
    it("matches a wildcard pattern against the hostname it covers", async () => {
      stubFetch({
        body: {
          success: true,
          hostname: "a1b2c3-dreamport-staging.bananasquad.workers.dev",
        },
      });

      expect(
        await verifyTurnstile({
          ...base,
          allowedHostnames: ["*-dreamport-staging.bananasquad.workers.dev"],
        }),
      ).toBe(true);
    });

    it("fails a wildcard pattern for a hostname outside this account's subdomain", async () => {
      stubFetch({
        body: {
          success: true,
          hostname: "a1b2c3-dreamport.someoneelse.workers.dev",
        },
      });

      expect(
        await verifyTurnstile({
          ...base,
          allowedHostnames: ["*-dreamport-staging.bananasquad.workers.dev"],
        }),
      ).toBe(false);
    });

    // Host names are case-insensitive per RFC 9110 (see issue #60).
    it("matches regardless of case, for both an exact and a wildcard pattern", async () => {
      stubFetch({
        body: { success: true, hostname: "Dreamport.Example.COM" },
      });

      expect(
        await verifyTurnstile({
          ...base,
          allowedHostnames: ["dreamport.example.com"],
        }),
      ).toBe(true);

      stubFetch({
        body: {
          success: true,
          hostname: "A1B2C3-Dreamport-Staging.Bananasquad.Workers.Dev",
        },
      });

      expect(
        await verifyTurnstile({
          ...base,
          allowedHostnames: ["*-dreamport-staging.bananasquad.workers.dev"],
        }),
      ).toBe(true);
    });
  });
});
