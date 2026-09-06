import type { ServiceRequest } from "@/lib/types";

/**
 * Whether the customer has written in (on /r/<token>) since staff last opened
 * the request. PostgREST can't compare two columns of the same row, so the
 * inbox filters `last_customer_message_at is not null` server-side and uses
 * this to decide which of those rows still need reading.
 */
export function hasUnreadCustomerMessage(
  request: Pick<ServiceRequest, "last_customer_message_at" | "customer_messages_read_at">
): boolean {
  const last = request.last_customer_message_at;
  if (!last) return false;
  const lastMs = new Date(last).getTime();
  if (Number.isNaN(lastMs)) return false;
  const read = request.customer_messages_read_at;
  if (!read) return true;
  const readMs = new Date(read).getTime();
  return Number.isNaN(readMs) || lastMs > readMs;
}
