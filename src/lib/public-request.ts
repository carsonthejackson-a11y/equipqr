import { z } from "zod";
// From @/lib/short-code, not @/lib/qr: this module is imported by the public
// scan page's client components, and @/lib/qr pulls the `qrcode` renderer
// (~150KB) into whatever bundle imports it.
import { normalizeShortCode } from "@/lib/short-code";
import type { RequestPriority } from "@/lib/types";

// Pure, dependency-light helpers shared by the public scan flow:
// `/e/[qrToken]`, `/e/[qrToken]/request` and `POST /api/service-requests`.
// Nothing here touches the network or `server-only`, so both the client
// form and the route handler can import it — and it can be unit tested.

// ----------------------------------------------------------------------------
// Scan source
// ----------------------------------------------------------------------------

export type ScanSource = "qr" | "short_code" | "link";

/** Legacy instant tokens minted before migration 0013: 24 hex characters. */
const LEGACY_HEX_TOKEN = /^[0-9a-f]{24}$/i;

/**
 * How did this visitor arrive?
 *
 * - `link` whenever the URL carries `?src=link` — someone shared the URL
 *   rather than scanning the sticker, and that shouldn't inflate scan counts.
 * - `short_code` when the token in the URL is (or normalises to) an 8-char
 *   short code — those URLs are what new labels encode, and are also what a
 *   customer types in by hand off a scuffed sticker.
 * - `qr` otherwise, which covers every legacy 24-hex token.
 */
export function detectScanSource(token: string, srcParam?: string | string[] | null): ScanSource {
  const src = Array.isArray(srcParam) ? srcParam[0] : srcParam;
  if (src === "link") return "link";
  if (LEGACY_HEX_TOKEN.test(token.trim())) return "qr";
  return normalizeShortCode(token) ? "short_code" : "qr";
}

// ----------------------------------------------------------------------------
// Priority
// ----------------------------------------------------------------------------

/**
 * The urgency question we actually ask a customer standing in front of a
 * broken machine. `urgent` is deliberately absent — it is reserved for staff
 * triage, so a customer can never self-select the top of the queue.
 */
export const PRIORITY_CHOICES = [
  { value: "not_urgent", label: "Not urgent", hint: "Whenever you're next nearby" },
  { value: "soon", label: "Soon", hint: "Slowing us down" },
  { value: "urgent", label: "Urgent", hint: "We can't use it at all" },
] as const;

export type PriorityChoice = (typeof PRIORITY_CHOICES)[number]["value"];

export const DEFAULT_PRIORITY_CHOICE: PriorityChoice = "soon";

/** Maps the friendly answer onto the stored priority. Never returns `urgent` — that stays a staff-only escalation. */
export function priorityFromChoice(choice: PriorityChoice): RequestPriority {
  switch (choice) {
    case "not_urgent":
      return "low";
    case "urgent":
      return "high";
    default:
      return "normal";
  }
}

// ----------------------------------------------------------------------------
// Request reference
// ----------------------------------------------------------------------------

/**
 * A short, readable reference the customer can quote on the phone, derived
 * from the request's public token. Not a secret and not a lookup key — the
 * full token in the /r/<token> link is what actually resolves the request.
 */
export function requestReference(publicToken: string): string {
  const cleaned = publicToken.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const eight = cleaned.slice(0, 8).padEnd(8, "0");
  return `${eight.slice(0, 4)}-${eight.slice(4)}`;
}

/**
 * sessionStorage key holding the status URL of the request this browser last
 * submitted for a given sticker, so re-scanning it can offer "view status"
 * instead of a blank form. Best effort only — a different phone, a new tab
 * after a restart, or private browsing simply won't have it, and the emailed
 * link remains the durable way back.
 */
export function openRequestStorageKey(qrToken: string): string {
  return `equipqr-open-request-${qrToken}`;
}

// ----------------------------------------------------------------------------
// Submission payload
// ----------------------------------------------------------------------------

export const MAX_MEDIA_ITEMS = 6;
export const MAX_DESCRIPTION_LENGTH = 4000;

const mediaItemSchema = z.object({
  storage_path: z.string().min(1).max(400),
  media_type: z.enum(["image", "video"]),
});

const pathEntrySchema = z.object({
  question: z.string().max(500),
  answer: z.string().max(500),
});

/**
 * Validates the body of `POST /api/service-requests`.
 *
 * Two rules beyond plain field limits:
 *  - at least one of phone/email, so the company can actually reach the
 *    person who reported the problem;
 *  - every uploaded object path must sit under the scanned token's prefix,
 *    which is the shape the client uploader writes. Storage lets anon
 *    clients write anywhere in the bucket (migration 0001), so this is what
 *    stops a submission from attaching someone else's uploads to a request.
 */
export const serviceRequestSchema = z
  .object({
    qrToken: z.string().min(1).max(200),
    description: z.string().trim().min(1, "Please describe the problem").max(MAX_DESCRIPTION_LENGTH),
    contactName: z.string().trim().min(1, "Please enter your name").max(120),
    contactEmail: z
      .string()
      .trim()
      .max(200)
      .refine((v) => v === "" || z.string().email().safeParse(v).success, "Enter a valid email address")
      .optional()
      .default(""),
    contactPhone: z.string().trim().max(40).optional().default(""),
    priority: z.enum(["low", "normal", "high"]).optional().default("normal"),
    media: z.array(mediaItemSchema).max(MAX_MEDIA_ITEMS).optional().default([]),
    troubleshootingPath: z.array(pathEntrySchema).max(50).optional().default([]),
  })
  .refine((v) => !!(v.contactEmail || v.contactPhone), {
    message: "Add a phone number or an email so we can reach you",
    path: ["contactPhone"],
  })
  .refine((v) => v.media.every((m) => isOwnedUploadPath(m.storage_path, v.qrToken)), {
    message: "Attachment paths are invalid",
    path: ["media"],
  });

export type ServiceRequestInput = z.infer<typeof serviceRequestSchema>;

/** Storage objects for a submission live under `<qrToken>/…`; anything else isn't this scan's upload. */
export function isOwnedUploadPath(storagePath: string, qrToken: string): boolean {
  if (storagePath.includes("..") || storagePath.startsWith("/")) return false;
  return storagePath.startsWith(`${qrToken}/`) && storagePath.length > qrToken.length + 1;
}

/** First readable error message from a failed parse, for the JSON 400 body. */
export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid request";
}
