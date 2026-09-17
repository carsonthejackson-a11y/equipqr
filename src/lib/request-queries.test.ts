import { describe, expect, it } from "vitest";
import {
  applyAwaitingVendor,
  applyOpen,
  applyUnassignedOpen,
  applyUnreadMessages,
  applyUrgentOpen,
  CLOSED_STATUSES,
  looksLikeRequestReference,
  OPEN_STATUSES,
  REQUEST_BUCKETS,
  requestReferenceSearchPrefix,
  type RequestBucketKey,
  type RequestFilterBuilder,
} from "@/lib/request-queries";
import { requestReference } from "@/lib/public-request";

/** A minimal fake filter-builder chain that just records what was called, for asserting an applier's exact predicate without a real Supabase client. */
class FakeFilterBuilder implements RequestFilterBuilder<FakeFilterBuilder> {
  calls: { method: string; args: unknown[] }[] = [];

  eq(column: string, value: string | number | boolean): this {
    this.calls.push({ method: "eq", args: [column, value] });
    return this;
  }

  in(column: string, values: readonly (string | number)[]): this {
    this.calls.push({ method: "in", args: [column, values] });
    return this;
  }

  is(column: string, value: null): this {
    this.calls.push({ method: "is", args: [column, value] });
    return this;
  }

  gt(column: string, value: number): this {
    this.calls.push({ method: "gt", args: [column, value] });
    return this;
  }
}

describe("OPEN_STATUSES / CLOSED_STATUSES", () => {
  it("matches the real RequestStatus enum as read from status-badge.tsx, with no overlap", () => {
    expect(OPEN_STATUSES).toEqual(["new", "in_progress", "scheduled", "on_hold"]);
    expect(CLOSED_STATUSES).toEqual(["resolved", "canceled"]);
    for (const status of OPEN_STATUSES) {
      expect(CLOSED_STATUSES).not.toContain(status);
    }
  });
});

describe("applyOpen", () => {
  it("filters to the open status set only", () => {
    const query = applyOpen(new FakeFilterBuilder());
    expect(query.calls).toEqual([{ method: "in", args: ["status", OPEN_STATUSES] }]);
  });
});

describe("applyUnassignedOpen", () => {
  it("combines the open filter with assigned_to IS NULL", () => {
    const query = applyUnassignedOpen(new FakeFilterBuilder());
    expect(query.calls).toEqual([
      { method: "in", args: ["status", OPEN_STATUSES] },
      { method: "is", args: ["assigned_to", null] },
    ]);
  });
});

describe("applyUrgentOpen", () => {
  it("combines the open filter with priority IN (high, urgent)", () => {
    const query = applyUrgentOpen(new FakeFilterBuilder());
    expect(query.calls).toEqual([
      { method: "in", args: ["status", OPEN_STATUSES] },
      { method: "in", args: ["priority", ["high", "urgent"]] },
    ]);
  });
});

describe("applyUnreadMessages", () => {
  it("filters unread_customer_messages > 0 with no open-status restriction", () => {
    const query = applyUnreadMessages(new FakeFilterBuilder());
    expect(query.calls).toEqual([{ method: "gt", args: ["unread_customer_messages", 0] }]);
  });
});

describe("applyAwaitingVendor", () => {
  it("combines the open filter with dispatch_status IN (sent, viewed)", () => {
    const query = applyAwaitingVendor(new FakeFilterBuilder());
    expect(query.calls).toEqual([
      { method: "in", args: ["status", OPEN_STATUSES] },
      { method: "in", args: ["dispatch_status", ["sent", "viewed"]] },
    ]);
  });
});

describe("REQUEST_BUCKETS", () => {
  const keys = Object.keys(REQUEST_BUCKETS) as RequestBucketKey[];

  it("has a self-consistent key and a ?bucket=<key> href for every entry", () => {
    for (const key of keys) {
      const bucket = REQUEST_BUCKETS[key];
      expect(bucket.key).toBe(key);
      expect(bucket.href).toBe(`/dashboard/requests?bucket=${key}`);
      expect(bucket.label.length).toBeGreaterThan(0);
    }
  });

  it("covers exactly the five appliers this module exports", () => {
    expect(keys.sort()).toEqual(["awaitingVendor", "open", "unassigned", "unreadMessages", "urgent"]);
  });

  it("each bucket's apply produces the identical predicate as calling its applier directly", () => {
    expect(REQUEST_BUCKETS.open.apply(new FakeFilterBuilder()).calls).toEqual(
      applyOpen(new FakeFilterBuilder()).calls
    );
    expect(REQUEST_BUCKETS.unassigned.apply(new FakeFilterBuilder()).calls).toEqual(
      applyUnassignedOpen(new FakeFilterBuilder()).calls
    );
    expect(REQUEST_BUCKETS.urgent.apply(new FakeFilterBuilder()).calls).toEqual(
      applyUrgentOpen(new FakeFilterBuilder()).calls
    );
    expect(REQUEST_BUCKETS.unreadMessages.apply(new FakeFilterBuilder()).calls).toEqual(
      applyUnreadMessages(new FakeFilterBuilder()).calls
    );
    expect(REQUEST_BUCKETS.awaitingVendor.apply(new FakeFilterBuilder()).calls).toEqual(
      applyAwaitingVendor(new FakeFilterBuilder()).calls
    );
  });
});

describe("looksLikeRequestReference / requestReferenceSearchPrefix (Q-07)", () => {
  it("recognises a dashed, uppercase reference exactly as printed to the customer", () => {
    expect(looksLikeRequestReference("D858-8364")).toBe(true);
  });

  it("recognises the same reference lowercase, spaced, or with no dash", () => {
    expect(looksLikeRequestReference("d858-8364")).toBe(true);
    expect(looksLikeRequestReference("  D858-8364  ")).toBe(true);
    expect(looksLikeRequestReference("D8588364")).toBe(true);
    expect(looksLikeRequestReference("d8588364")).toBe(true);
  });

  it("rejects things that aren't an 8-character reference", () => {
    expect(looksLikeRequestReference("D858")).toBe(false);
    expect(looksLikeRequestReference("D858-83645")).toBe(false);
    expect(looksLikeRequestReference("water heater")).toBe(false);
    expect(looksLikeRequestReference("jane@example.com")).toBe(false);
    expect(looksLikeRequestReference("")).toBe(false);
    // Two dashes, or a dash anywhere but the middle, isn't the printed shape.
    expect(looksLikeRequestReference("D8-58-8364")).toBe(false);
    expect(looksLikeRequestReference("-D8588364")).toBe(false);
  });

  it("strips the dash and lowercases, regardless of input casing/spacing", () => {
    expect(requestReferenceSearchPrefix("D858-8364")).toBe("d8588364");
    expect(requestReferenceSearchPrefix("d8588364")).toBe("d8588364");
    expect(requestReferenceSearchPrefix("  D858-8364  ")).toBe("d8588364");
  });

  it("round-trips against requestReference() for a UUID-shaped public token", () => {
    // Real public_token values are UUIDs (gen_random_uuid()), whose first 8
    // characters are always the hex digits before the first hyphen — so the
    // prefix this produces is what a plain `ilike` prefix match against the
    // raw column needs, with no further stripping of the token itself.
    const token = "d8588364-91ab-4e2f-8c3d-111111111111";
    const reference = requestReference(token);
    expect(reference).toBe("D858-8364");
    expect(requestReferenceSearchPrefix(reference)).toBe(token.slice(0, 8));
  });
});
