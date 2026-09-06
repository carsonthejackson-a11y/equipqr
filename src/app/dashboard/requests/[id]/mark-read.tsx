"use client";

import { useEffect } from "react";
import { markCustomerMessagesRead } from "../actions";

/**
 * Stamps the request's customer_messages_read_at once the detail page is on
 * screen. Rendered by the (server) page only while there's an unread
 * customer reply, so it fires at most once per visit and unmounts after
 * the action's revalidation re-renders the page. Best-effort: a failure
 * just leaves the unread dot in place until next time.
 */
export function MarkCustomerMessagesRead({ requestId, seenAt }: { requestId: string; seenAt: string }) {
  useEffect(() => {
    markCustomerMessagesRead(requestId, seenAt).catch(() => {});
  }, [requestId, seenAt]);

  return null;
}
