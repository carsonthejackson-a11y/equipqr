import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// @/lib/email/layout and @/lib/rate-limit are `import "server-only"`-tagged;
// vitest runs under Node, not React's "react-server" condition, so the real
// package would throw. Same fix as send.test.ts.
vi.mock("server-only", () => ({}));

const sendMock = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: (...args: unknown[]) => sendMock(...args) };
  },
}));

const CLIENT_IP = "203.0.113.9";
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": `${CLIENT_IP}, 10.0.0.1` }),
}));

const checkRateLimitMock = vi.fn<(key: string, rule: unknown) => Promise<boolean>>(async () => true);
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  // Keep the real getClientIpFromHeaders so the bucket key is the real one.
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return {
    ...actual,
    checkRateLimit: (key: string, rule: unknown) => checkRateLimitMock(key, rule),
  };
});

const SUPPORT = "support@equipqr.co";

function submission(overrides: Partial<Record<"name" | "email" | "company" | "message", string>> = {}) {
  const values = {
    name: "Dana Owner",
    email: "dana@example.com",
    company: "Acme Repair",
    message: "How do I order stickers?",
    ...overrides,
  };
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}

const IDLE = { status: "idle" } as const;

describe("submitContactForm", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM_EMAIL", "EquipQR <notify@equipqr.co>");
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_EMAIL", SUPPORT);
    sendMock.mockReset().mockResolvedValue({ data: { id: "email_1" }, error: null });
    checkRateLimitMock.mockReset().mockResolvedValue(true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sends and reports success on the happy path", async () => {
    const { submitContactForm } = await import("./actions");
    const result = await submitContactForm(IDLE, submission());

    expect(result.status).toBe("success");
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: SUPPORT,
        replyTo: "dana@example.com",
        subject: "Contact form: Dana Owner (Acme Repair)",
      })
    );
    expect(checkRateLimitMock).toHaveBeenCalledWith(`contact:ip:${CLIENT_IP}`, { limit: 5, windowSeconds: 3600 });
  });

  it("reports an error (naming the support address) when Resend resolves { data: null, error } instead of throwing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    sendMock.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "The from address is not verified", statusCode: 422 },
    });

    const { submitContactForm } = await import("./actions");
    const result = await submitContactForm(IDLE, submission());

    expect(result.status).toBe("error");
    expect(result.message).toContain(SUPPORT);
  });

  it("refuses without sending when the per-IP rate limit is exceeded", async () => {
    checkRateLimitMock.mockResolvedValue(false);

    const { submitContactForm } = await import("./actions");
    const result = await submitContactForm(IDLE, submission());

    expect(result.status).toBe("error");
    expect(result.message).toContain(SUPPORT);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("validates before it rate-limits, so junk never consumes the bucket", async () => {
    const { submitContactForm } = await import("./actions");
    const result = await submitContactForm(IDLE, submission({ email: "not-an-email" }));

    expect(result.status).toBe("error");
    expect(checkRateLimitMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("keeps CR/LF out of the subject and caps it at 140 chars (header injection via the name field)", async () => {
    const { submitContactForm } = await import("./actions");
    await submitContactForm(IDLE, submission({ name: "Bob\r\nBcc: x@y.z", company: "C".repeat(300) }));

    expect(sendMock).toHaveBeenCalledTimes(1);
    const { subject } = sendMock.mock.calls[0][0] as { subject: string };
    expect(subject).not.toMatch(/[\r\n]/);
    expect(subject.length).toBeLessThanOrEqual(140);
    expect(subject.startsWith("Contact form: Bob")).toBe(true);
  });
});
