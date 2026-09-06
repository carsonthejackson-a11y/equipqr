import { describe, expect, it } from "vitest";
import {
  activityAuthorLabel,
  customerMessageSchema,
  isCustomerMessage,
  MAX_CUSTOMER_MESSAGE_LENGTH,
} from "@/lib/customer-message";
import { firstIssueMessage } from "@/lib/public-request";

const TOKEN = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";

describe("customerMessageSchema", () => {
  it("accepts a message and trims it", () => {
    const parsed = customerMessageSchema.parse({ token: TOKEN, body: "  The tech never showed  " });
    expect(parsed.body).toBe("The tech never showed");
    expect(parsed.token).toBe(TOKEN);
  });

  it("rejects an empty or whitespace-only body with a readable message", () => {
    for (const body of ["", "   ", "\n\t"]) {
      const result = customerMessageSchema.safeParse({ token: TOKEN, body });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(firstIssueMessage(result.error)).toBe("Please write a message first");
      }
    }
  });

  it("caps the body at the same length the RPC enforces", () => {
    expect(
      customerMessageSchema.safeParse({ token: TOKEN, body: "x".repeat(MAX_CUSTOMER_MESSAGE_LENGTH) })
        .success
    ).toBe(true);

    const tooLong = customerMessageSchema.safeParse({
      token: TOKEN,
      body: "x".repeat(MAX_CUSTOMER_MESSAGE_LENGTH + 1),
    });
    expect(tooLong.success).toBe(false);
    if (!tooLong.success) {
      expect(firstIssueMessage(tooLong.error)).toMatch(/too long/);
    }
  });

  it("does not count surrounding whitespace against the limit", () => {
    const padded = `   ${"x".repeat(MAX_CUSTOMER_MESSAGE_LENGTH)}   `;
    expect(customerMessageSchema.safeParse({ token: TOKEN, body: padded }).success).toBe(true);
  });

  it("requires a token between 1 and 200 characters", () => {
    expect(customerMessageSchema.safeParse({ token: "", body: "hi" }).success).toBe(false);
    expect(customerMessageSchema.safeParse({ body: "hi" }).success).toBe(false);
    expect(customerMessageSchema.safeParse({ token: "t", body: "hi" }).success).toBe(true);
    expect(customerMessageSchema.safeParse({ token: "t".repeat(200), body: "hi" }).success).toBe(
      true
    );
    expect(customerMessageSchema.safeParse({ token: "t".repeat(201), body: "hi" }).success).toBe(
      false
    );
  });

  it("rejects non-string fields", () => {
    expect(customerMessageSchema.safeParse({ token: 123, body: "hi" }).success).toBe(false);
    expect(customerMessageSchema.safeParse({ token: TOKEN, body: ["hi"] }).success).toBe(false);
  });
});

describe("isCustomerMessage", () => {
  it("is true only for messages the customer wrote", () => {
    expect(isCustomerMessage({ kind: "message", author_kind: "customer" })).toBe(true);
    expect(isCustomerMessage({ kind: "message", author_kind: "staff" })).toBe(false);
    expect(isCustomerMessage({ kind: "status_change", author_kind: "customer" })).toBe(false);
    expect(isCustomerMessage({ kind: "system", author_kind: "system" })).toBe(false);
  });
});

describe("activityAuthorLabel", () => {
  const company = "Acme HVAC";

  it("labels the customer's own rows as You", () => {
    expect(activityAuthorLabel({ kind: "message", author_kind: "customer" }, company)).toBe("You");
  });

  it("puts the company name on staff messages and customer-visible notes", () => {
    expect(activityAuthorLabel({ kind: "message", author_kind: "staff" }, company)).toBe(company);
    expect(activityAuthorLabel({ kind: "note", author_kind: "staff" }, company)).toBe(company);
  });

  it("leaves automated rows without a byline", () => {
    expect(activityAuthorLabel({ kind: "status_change", author_kind: "staff" }, company)).toBeNull();
    expect(activityAuthorLabel({ kind: "email_sent", author_kind: "system" }, company)).toBeNull();
    expect(activityAuthorLabel({ kind: "system", author_kind: "system" }, company)).toBeNull();
  });
});
