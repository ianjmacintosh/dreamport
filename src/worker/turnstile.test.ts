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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("verifyTurnstile", () => {
  it("returns true when siteverify reports success", async () => {
    stubFetch({ body: { success: true } });

    expect(
      await verifyTurnstile({
        secret: "s",
        token: "tok",
        remoteIp: null,
      }),
    ).toBe(true);
  });

  it("returns false when siteverify reports failure", async () => {
    stubFetch({
      body: { success: false, "error-codes": ["invalid-input-response"] },
    });

    expect(
      await verifyTurnstile({ secret: "s", token: "tok", remoteIp: null }),
    ).toBe(false);
  });

  it("returns false without calling siteverify when the token is missing", async () => {
    const fn = stubFetch({ body: { success: true } });

    expect(
      await verifyTurnstile({ secret: "s", token: null, remoteIp: null }),
    ).toBe(false);
    expect(
      await verifyTurnstile({ secret: "s", token: "", remoteIp: null }),
    ).toBe(false);
    expect(fn).not.toHaveBeenCalled();
  });

  it("fails closed when siteverify errors or returns non-2xx", async () => {
    stubFetch({ reject: true });
    expect(
      await verifyTurnstile({ secret: "s", token: "tok", remoteIp: null }),
    ).toBe(false);

    stubFetch({ ok: false, body: { success: true } });
    expect(
      await verifyTurnstile({ secret: "s", token: "tok", remoteIp: null }),
    ).toBe(false);
  });

  it("POSTs the secret, token, and client IP to the siteverify endpoint", async () => {
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
    expect(JSON.parse(init?.body as string)).toEqual({
      secret: "the-secret",
      response: "the-token",
      remoteip: "203.0.113.7",
    });
  });

  it("omits remoteip when no client IP is available", async () => {
    const fn = stubFetch({ body: { success: true } });

    await verifyTurnstile({ secret: "s", token: "tok", remoteIp: null });

    const [, init] = fetchCall(fn);
    expect(JSON.parse(init?.body as string)).toEqual({
      secret: "s",
      response: "tok",
    });
  });
});
