import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createEmailSender,
  getMockSender,
  MockEmailSender,
  ResendEmailSender,
  type OtpEmail,
} from "./sender";

const signIn: OtpEmail = {
  to: "recruit@resend.dev",
  otp: "418302",
  type: "sign-in",
};

afterEach(() => {
  vi.restoreAllMocks();
  getMockSender().clear();
});

describe("MockEmailSender", () => {
  it("records each send as { to, otp, type } and makes no network call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const sender = new MockEmailSender();

    await sender.sendOtp(signIn);
    await sender.sendOtp({ ...signIn, to: "second@resend.dev", otp: "000123" });

    expect(sender.sent).toEqual([
      { to: "recruit@resend.dev", otp: "418302", type: "sign-in" },
      { to: "second@resend.dev", otp: "000123", type: "sign-in" },
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("writes the code to the console so a dev can copy it", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await new MockEmailSender().sendOtp(signIn);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("418302"));
  });

  it("keeps recorded sends isolated per instance", async () => {
    const a = new MockEmailSender();
    const b = new MockEmailSender();

    await a.sendOtp(signIn);

    expect(a.sent).toHaveLength(1);
    expect(b.sent).toHaveLength(0);
  });
});

describe("ResendEmailSender", () => {
  const okResponse = () =>
    new Response(JSON.stringify({ id: "re_123" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  it("posts to the Resend API with the documented request shape", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(okResponse());

    await new ResendEmailSender({
      apiKey: "re_test_key",
      from: "noreply@mail.dreamport.ianjmacintosh.com",
    }).sendOtp(signIn);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");

    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_test_key");
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init.body as string) as Record<string, string>;
    expect(body.from).toBe("noreply@mail.dreamport.ianjmacintosh.com");
    expect(body.to).toBe("recruit@resend.dev");
    expect(body.subject).toMatch(/sign-in code/i);
    expect(body.text).toContain("418302");
  });

  it("rejects when Resend returns a non-2xx response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 422 }),
    );

    await expect(
      new ResendEmailSender({ apiKey: "re_test_key", from: "x@y.dev" }).sendOtp(
        signIn,
      ),
    ).rejects.toThrow(/422/);
  });
});

describe("createEmailSender", () => {
  it("returns the shared mock sender when EMAIL_MODE is unset", () => {
    expect(createEmailSender({})).toBe(getMockSender());
  });

  it("returns the shared mock sender when EMAIL_MODE=mock", () => {
    expect(createEmailSender({ EMAIL_MODE: "mock" })).toBe(getMockSender());
  });

  it("returns a Resend sender when EMAIL_MODE=resend and both vars are set", () => {
    const sender = createEmailSender({
      EMAIL_MODE: "resend",
      RESEND_API_KEY: "re_test_key",
      EMAIL_FROM: "noreply@mail.dreamport.ianjmacintosh.com",
    });

    expect(sender).toBeInstanceOf(ResendEmailSender);
  });

  it("throws when EMAIL_MODE=resend but RESEND_API_KEY is missing", () => {
    expect(() =>
      createEmailSender({ EMAIL_MODE: "resend", EMAIL_FROM: "x@y.dev" }),
    ).toThrow(/RESEND_API_KEY and EMAIL_FROM/);
  });

  it("throws when EMAIL_MODE=resend but EMAIL_FROM is missing", () => {
    expect(() =>
      createEmailSender({
        EMAIL_MODE: "resend",
        RESEND_API_KEY: "re_test_key",
      }),
    ).toThrow(/RESEND_API_KEY and EMAIL_FROM/);
  });
});
