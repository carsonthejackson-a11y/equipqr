import { z } from "zod";
import type { ActorKind, RequestActivityKind } from "@/lib/types";

// Pure, dependency-light helpers for two-way messaging on the public
// /r/<token> status page: the reply form (client), the page (server) and
// `POST /api/request-messages` all import from here. Nothing touches the
// network or `server-only`, so it can be unit tested in isolation.

/** Mirrors the cap `add_request_customer_message()` enforces in SQL (0019). */
export const MAX_CUSTOMER_MESSAGE_LENGTH = 2000;

/**
 * Validates the body of `POST /api/request-messages`. The token is the
 * request's public token straight from the URL — unguessable, and the only
 * credential the customer has. The body is trimmed before the length check
 * so a message of spaces doesn't slip past as "not empty".
 */
export const customerMessageSchema = z.object({
  token: z.string().min(1, "Missing request link").max(200, "Invalid request link"),
  body: z
    .string()
    .trim()
    .min(1, "Please write a message first")
    .max(
      MAX_CUSTOMER_MESSAGE_LENGTH,
      `Message is too long (${MAX_CUSTOMER_MESSAGE_LENGTH} characters max)`
    ),
});

export type CustomerMessageInput = z.infer<typeof customerMessageSchema>;

/** The minimal slice of a public activity entry the display helpers below need. */
export type PublicActivityLike = { kind: RequestActivityKind; author_kind: ActorKind };

/** Whether an entry on the status page is something the customer wrote (rendered as their own bubble). */
export function isCustomerMessage(entry: PublicActivityLike): boolean {
  return entry.author_kind === "customer" && entry.kind === "message";
}

/**
 * Who wrote an update, in the customer's frame of reference: their own
 * messages are "You", anything a person at the company wrote carries the
 * company name, and automated rows (status changes, emails) get no byline.
 */
export function activityAuthorLabel(entry: PublicActivityLike, companyName: string): string | null {
  if (entry.author_kind === "customer") return "You";
  if (entry.author_kind === "staff" && (entry.kind === "message" || entry.kind === "note")) {
    return companyName;
  }
  return null;
}
