import { describe, expect, it } from "vitest";
import { hasUnreadCustomerMessage } from "./unread";

describe("hasUnreadCustomerMessage", () => {
  it("is false when the customer never wrote in", () => {
    expect(hasUnreadCustomerMessage({ last_customer_message_at: null, customer_messages_read_at: null })).toBe(false);
    expect(
      hasUnreadCustomerMessage({ last_customer_message_at: null, customer_messages_read_at: "2026-09-01T10:00:00Z" })
    ).toBe(false);
  });

  it("is true when a message exists and staff never opened the request", () => {
    expect(
      hasUnreadCustomerMessage({ last_customer_message_at: "2026-09-01T10:00:00Z", customer_messages_read_at: null })
    ).toBe(true);
  });

  it("compares the two timestamps as instants", () => {
    expect(
      hasUnreadCustomerMessage({
        last_customer_message_at: "2026-09-01T10:00:00Z",
        customer_messages_read_at: "2026-09-01T09:59:59Z",
      })
    ).toBe(true);
    expect(
      hasUnreadCustomerMessage({
        last_customer_message_at: "2026-09-01T10:00:00Z",
        customer_messages_read_at: "2026-09-01T10:00:00Z",
      })
    ).toBe(false);
    expect(
      hasUnreadCustomerMessage({
        last_customer_message_at: "2026-09-01T10:00:00Z",
        customer_messages_read_at: "2026-09-02T08:00:00Z",
      })
    ).toBe(false);
  });

  it("is not fooled by differing offsets in the wire format", () => {
    expect(
      hasUnreadCustomerMessage({
        last_customer_message_at: "2026-09-01T05:00:00-05:00", // 10:00Z
        customer_messages_read_at: "2026-09-01T09:00:00+00:00",
      })
    ).toBe(true);
  });

  it("treats garbage timestamps conservatively", () => {
    expect(hasUnreadCustomerMessage({ last_customer_message_at: "nope", customer_messages_read_at: null })).toBe(false);
    expect(
      hasUnreadCustomerMessage({ last_customer_message_at: "2026-09-01T10:00:00Z", customer_messages_read_at: "nope" })
    ).toBe(true);
  });
});
