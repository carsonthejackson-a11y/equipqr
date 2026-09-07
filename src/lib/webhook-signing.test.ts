import { describe, expect, it } from "vitest";
import {
  SUBSCRIBABLE_WEBHOOK_EVENTS,
  WEBHOOK_EVENT_TYPES,
  buildSignatureHeader,
  computeWebhookSignature,
  isWebhookEventType,
  verifyWebhookSignature,
  webhookEventLabel,
  webhookUrlError,
} from "./webhook-signing";

describe("webhook signatures", () => {
  const secret = "whsec_test_secret";
  const body = JSON.stringify({ id: "evt_1", type: "webhook.test", data: { hello: "world" } });

  it("signs deterministically over `<t>.<body>`", () => {
    const a = computeWebhookSignature(secret, 1_700_000_000, body);
    const b = computeWebhookSignature(secret, 1_700_000_000, body);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(computeWebhookSignature(secret, 1_700_000_001, body)).not.toBe(a);
    expect(computeWebhookSignature("other", 1_700_000_000, body)).not.toBe(a);
  });

  it("verifier accepts what the sender produced", () => {
    const now = new Date("2026-09-06T12:00:00Z");
    const header = buildSignatureHeader(secret, body, now);
    expect(header).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect(verifyWebhookSignature({ secret, header, body, now })).toBe(true);
  });

  it("rejects a tampered body, a wrong secret, and a stale timestamp", () => {
    const now = new Date("2026-09-06T12:00:00Z");
    const header = buildSignatureHeader(secret, body, now);
    expect(verifyWebhookSignature({ secret, header, body: body + " ", now })).toBe(false);
    expect(verifyWebhookSignature({ secret: "nope", header, body, now })).toBe(false);
    const later = new Date(now.getTime() + 6 * 60 * 1000);
    expect(verifyWebhookSignature({ secret, header, body, now: later })).toBe(false);
    expect(verifyWebhookSignature({ secret, header, body, now: later, toleranceSeconds: 600 })).toBe(true);
  });

  it("rejects malformed headers without throwing", () => {
    expect(verifyWebhookSignature({ secret, header: null, body })).toBe(false);
    expect(verifyWebhookSignature({ secret, header: "", body })).toBe(false);
    expect(verifyWebhookSignature({ secret, header: "t=abc,v1=zz", body })).toBe(false);
    expect(verifyWebhookSignature({ secret, header: "v1=deadbeef", body })).toBe(false);
    expect(verifyWebhookSignature({ secret, header: "t=1700000000", body })).toBe(false);
  });
});

describe("event catalogue", () => {
  it("every subscribable type has a label and excludes the test event", () => {
    expect(SUBSCRIBABLE_WEBHOOK_EVENTS).not.toContain("webhook.test");
    for (const type of SUBSCRIBABLE_WEBHOOK_EVENTS) {
      expect(WEBHOOK_EVENT_TYPES[type]).toBeTruthy();
      expect(isWebhookEventType(type)).toBe(true);
    }
    expect(isWebhookEventType("equipment.exploded")).toBe(false);
    expect(webhookEventLabel("service_request.created")).toBe("Service request submitted");
    expect(webhookEventLabel("something.new")).toBe("something.new");
  });
});

describe("webhookUrlError", () => {
  it("accepts a normal https URL", () => {
    expect(webhookUrlError("https://hooks.example.com/equipqr?x=1")).toBeNull();
  });

  it("rejects http, credentials, garbage, and internal hosts", () => {
    expect(webhookUrlError("http://example.com/hook")).toMatch(/https/);
    expect(webhookUrlError("not a url")).toMatch(/full URL/);
    expect(webhookUrlError("https://user:pw@example.com/hook")).toMatch(/credentials/);
    expect(webhookUrlError("https://localhost/hook")).toMatch(/reachable/);
    expect(webhookUrlError("https://10.0.0.5/hook")).toMatch(/reachable/);
    expect(webhookUrlError("https://192.168.1.1/hook")).toMatch(/reachable/);
    expect(webhookUrlError("https://172.20.0.1/hook")).toMatch(/reachable/);
    expect(webhookUrlError("https://svc.internal/hook")).toMatch(/reachable/);
    expect(webhookUrlError("https://100.64.0.1/hook")).toMatch(/reachable/);
    expect(webhookUrlError("https://0x7f000001/hook")).toMatch(/reachable/);
    expect(webhookUrlError("https://[::1]/hook")).toMatch(/IPv6/);
    expect(webhookUrlError("https://[::ffff:127.0.0.1]/hook")).toMatch(/IPv6/);
    expect(webhookUrlError("https://[fd00::1]/hook")).toMatch(/IPv6/);
  });
});
