import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// request-status.ts (via layout.ts) is `import "server-only"`-tagged; vitest
// runs it under Node, not React's "react-server" condition, so the real
// package would throw. Same fix as api-auth.test.ts.
vi.mock("server-only", () => ({}));

const sendCompanyEmailMock = vi.fn();
vi.mock("./company-email", () => ({
  sendCompanyEmail: (params: unknown) => sendCompanyEmailMock(params),
}));

const emitRequestActivityMock = vi.fn().mockResolvedValue(null);
vi.mock("@/lib/events", () => ({
  emitRequestActivity: (...args: unknown[]) => emitRequestActivityMock(...args),
}));

import { buildRequestStatusUpdateEmail, notifyRequesterOfStatus, type RequestEmailBranding } from "./request-status";
import { vocabFor } from "@/lib/vocab";
import type { SupabaseClient } from "@supabase/supabase-js";

const BRAND: RequestEmailBranding = {
  name: "Riverside Repair",
  color: "#0d9488",
  onColor: "#ffffff",
  logoUrl: null,
  phone: "555-0100",
};

describe("buildRequestStatusUpdateEmail", () => {
  it("uses provider vocab by default ('technician' / 'service request')", () => {
    const { html, text } = buildRequestStatusUpdateEmail({
      brand: BRAND,
      equipmentName: "Ice machine",
      contactName: "Jamie",
      status: "in_progress",
      statusUrl: "https://app.equipqr.com/r/tok",
      timeZone: "America/Chicago",
    });
    expect(html).toContain("A technician is working on your service request");
    expect(text).toContain("A technician is working on your service request");
  });

  it("switches to owner vocab ('vendor' / 'work order') when given an owner-kind vocab", () => {
    const { html, text } = buildRequestStatusUpdateEmail({
      brand: BRAND,
      equipmentName: "Ice machine",
      contactName: "Jamie",
      status: "in_progress",
      statusUrl: "https://app.equipqr.com/r/tok",
      timeZone: "America/Chicago",
      vocab: vocabFor("equipment_owner"),
    });
    expect(html).toContain("A vendor is working on your work order");
    expect(text).toContain("A vendor is working on your work order");
  });

  describe("scheduled-visit time rendering (C1-23/Q-01)", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("renders the visit time in the company's own zone with a zone label, regardless of process.env.TZ", () => {
      vi.stubEnv("TZ", "Asia/Tokyo");

      const { html, text } = buildRequestStatusUpdateEmail({
        brand: BRAND,
        equipmentName: "Ice machine",
        contactName: "Jamie",
        status: "scheduled",
        statusUrl: "https://app.equipqr.com/r/tok",
        // 2026-09-16T15:00:00Z is 10:00 AM Wednesday Sep 16 in America/Chicago (CDT) —
        // and a completely different wall-clock day/time in Asia/Tokyo.
        scheduledFor: "2026-09-16T15:00:00.000Z",
        timeZone: "America/Chicago",
      });

      expect(html).toContain("Wednesday, September 16 at 10:00 AM CDT");
      expect(text).toContain("Wednesday, September 16 at 10:00 AM CDT");
      // Never the raw UTC/server-local rendering this used to fall back to.
      expect(html).not.toContain("Tokyo");
    });

    it("falls back to a time-free line when no visit is scheduled", () => {
      const { text } = buildRequestStatusUpdateEmail({
        brand: BRAND,
        equipmentName: "Ice machine",
        contactName: "Jamie",
        status: "scheduled",
        statusUrl: "https://app.equipqr.com/r/tok",
        scheduledFor: null,
        timeZone: "America/Chicago",
      });
      expect(text).toContain("A visit has been scheduled.");
    });
  });
});

describe("notifyRequesterOfStatus", () => {
  const supabase = {} as SupabaseClient;

  const company = {
    id: "co1",
    name: "Riverside Repair",
    slug: "riverside",
    notification_email: "shop@riverside.example",
    trial_ends_at: "2099-01-01T00:00:00.000Z",
    stripe_customer_id: null,
    welcome_email_sent_at: null,
    trial_reminder_sent_at: null,
    onboarding_dismissed_at: null,
    logo_path: null,
    brand_color: null,
    phone: "555-0100",
    sms_number: null,
    website: null,
    timezone: "America/Chicago",
    customer_updates_enabled: true,
    created_at: "2020-01-01T00:00:00.000Z",
    kind: "service_provider" as const,
    owner_setup_completed_at: null,
  };

  const request = {
    id: "req1",
    company_id: "co1",
    contact_name: "Jamie",
    contact_email: "jamie@example.com",
    public_token: "tok",
    scheduled_for: null,
  };

  beforeEach(() => {
    sendCompanyEmailMock.mockReset();
    emitRequestActivityMock.mockClear();
    // getRequestStatusUrl() (called inside notifyRequesterOfStatus) reads
    // serverEnv, which validates on every access — see anthropic.test.ts for
    // the same pattern.
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  it("returns false and never sends when customer_updates_enabled is off", async () => {
    const result = await notifyRequesterOfStatus(supabase, {
      request,
      status: "in_progress",
      equipmentName: "Ice machine",
      company: { ...company, customer_updates_enabled: false },
      planId: null,
      supabaseUrl: "https://example.supabase.co",
    });
    expect(result).toBe(false);
    expect(sendCompanyEmailMock).not.toHaveBeenCalled();
  });

  it("returns false and never sends when the requester left no email", async () => {
    const result = await notifyRequesterOfStatus(supabase, {
      request: { ...request, contact_email: null },
      status: "in_progress",
      equipmentName: "Ice machine",
      company,
      planId: null,
      supabaseUrl: "https://example.supabase.co",
    });
    expect(result).toBe(false);
    expect(sendCompanyEmailMock).not.toHaveBeenCalled();
  });

  it("returns true and records an email_sent activity when the send succeeds", async () => {
    sendCompanyEmailMock.mockResolvedValueOnce({ sent: true, to: "jamie@example.com" });

    const result = await notifyRequesterOfStatus(supabase, {
      request,
      status: "in_progress",
      equipmentName: "Ice machine",
      company,
      planId: null,
      supabaseUrl: "https://example.supabase.co",
    });

    expect(result).toBe(true);
    expect(sendCompanyEmailMock).toHaveBeenCalledTimes(1);
    expect(emitRequestActivityMock).toHaveBeenCalledTimes(1);
    expect(emitRequestActivityMock.mock.calls[0][1]).toMatchObject({ kind: "email_sent", serviceRequestId: "req1" });
  });

  it("returns false and records nothing when Resend declines the send (honest reporting, C1-31/Q-03)", async () => {
    sendCompanyEmailMock.mockResolvedValueOnce({ sent: false, to: "jamie@example.com" });

    const result = await notifyRequesterOfStatus(supabase, {
      request,
      status: "in_progress",
      equipmentName: "Ice machine",
      company,
      planId: null,
      supabaseUrl: "https://example.supabase.co",
    });

    expect(result).toBe(false);
    expect(emitRequestActivityMock).not.toHaveBeenCalled();
  });

  it("returns false instead of throwing when building or sending blows up", async () => {
    sendCompanyEmailMock.mockRejectedValueOnce(new Error("network down"));

    const result = await notifyRequesterOfStatus(supabase, {
      request,
      status: "in_progress",
      equipmentName: "Ice machine",
      company,
      planId: null,
      supabaseUrl: "https://example.supabase.co",
    });

    expect(result).toBe(false);
  });
});
