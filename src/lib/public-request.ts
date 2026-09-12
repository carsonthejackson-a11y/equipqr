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

// ----------------------------------------------------------------------------
// Two-way messaging — POST /api/request-updates (Next roadmap, migration 0019)
// ----------------------------------------------------------------------------

/** Mirrors the 2–2000 char check inside add_customer_request_update() so a bad length fails fast, client- and server-side, before the DB round trip. */
export const MIN_MESSAGE_LENGTH = 2;
export const MAX_MESSAGE_LENGTH = 2000;

/**
 * localStorage key for the name a customer typed into the /r/<token> message
 * composer, remembered across visits so they don't retype it every time they
 * check on a request. Not scoped to one token — the same person plausibly
 * manages several units for the same site. Best effort only, like
 * {@link openRequestStorageKey} above: the composer works fine with it empty.
 */
export function requestUpdateAuthorStorageKey(): string {
  return "equipqr-request-update-author";
}

/**
 * Validates the body of `POST /api/request-updates`. `website` is a honeypot:
 * a hidden field real customers never see or fill in, so the route can
 * report success without touching the database when it's non-empty rather
 * than tipping off a bot that it was caught.
 */
export const requestUpdateSchema = z.object({
  token: z.string().min(1).max(200),
  body: z
    .string()
    .trim()
    .min(MIN_MESSAGE_LENGTH, "Please write a bit more")
    .max(MAX_MESSAGE_LENGTH, "That's too long — please shorten it"),
  authorName: z.string().trim().min(1, "Please enter your name").max(120),
  contactPhone: z.string().trim().max(40).optional().default(""),
  contactEmail: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === "" || z.string().email().safeParse(v).success, "Enter a valid email address")
    .optional()
    .default(""),
  website: z.string().max(200).optional().default(""),
});

export type RequestUpdateInput = z.infer<typeof requestUpdateSchema>;

// ----------------------------------------------------------------------------
// Owner roadmap (docs/OWNER-ROADMAP-BRIEF.md §3.3) — the equipment_owner
// branch of the public scan flow: /e/[qrToken]/owner/*, /api/site-pin,
// /api/owner-requests, /v/[token] and /api/vendor-actions.
// ----------------------------------------------------------------------------

/**
 * The urgency question asked on the owner-kind report form. Unlike
 * {@link PRIORITY_CHOICES}, the top label is "We can't operate without this"
 * rather than "Urgent" — a restaurant reporting a dead walk-in cooler is
 * choosing the same stored priority, but "urgent" reads like a customer
 * demanding queue-jumping, and this is a staff member describing how bad it
 * actually is. Values are shared with priorityFromChoice() on purpose — a
 * broken machine's severity doesn't need two different priority enums.
 */
export const OWNER_PRIORITY_CHOICES = [
  { value: "not_urgent", label: "Not urgent", hint: "Whenever they're next nearby" },
  { value: "soon", label: "Soon", hint: "It's slowing us down" },
  { value: "urgent", label: "We can't operate without this", hint: "We're down right now" },
] as const satisfies readonly { value: PriorityChoice; label: string; hint: string }[];

/** Cap on symptom chips accepted per submission — mirrors submit_owner_service_request()'s `p_symptoms[1:12]` slice. */
export const MAX_SYMPTOMS = 12;

/**
 * Validates the body of `POST /api/owner-requests`. Mirrors
 * {@link serviceRequestSchema}'s media-ownership rule, but the owner form
 * collects symptom chips instead of email/phone-required contact info (no
 * email field at all — staff don't have work email) and an opaque site-PIN
 * pass instead of nothing.
 *
 * `submit_owner_service_request()` requires a non-empty description
 * (1-4000 chars) at the database layer, so a submission with only chips and
 * no free text still needs *something* sent as `p_description` — the route
 * synthesizes it from the chips. This schema only enforces that the visitor
 * gave *some* signal (a chip or free text), not that `description` itself is
 * non-empty.
 */
export const ownerServiceRequestSchema = z
  .object({
    qrToken: z.string().min(1).max(200),
    description: z.string().trim().max(MAX_DESCRIPTION_LENGTH).optional().default(""),
    contactName: z.string().trim().min(1, "Please enter your name").max(120),
    reporterPhone: z.string().trim().max(40).optional().default(""),
    symptoms: z.array(z.string().trim().min(1).max(120)).max(MAX_SYMPTOMS).optional().default([]),
    priority: z.enum(["low", "normal", "high"]).optional().default("normal"),
    media: z.array(mediaItemSchema).max(MAX_MEDIA_ITEMS).optional().default([]),
    pinPass: z.string().max(200).optional().default(""),
    /** Honeypot — a hidden field real visitors never fill in. */
    website: z.string().max(200).optional().default(""),
  })
  .refine((v) => !!(v.description.trim() || v.symptoms.length > 0), {
    message: "Pick a symptom or tell us what's wrong",
    path: ["description"],
  })
  .refine((v) => v.media.every((m) => isOwnedUploadPath(m.storage_path, v.qrToken)), {
    message: "Attachment paths are invalid",
    path: ["media"],
  });

export type OwnerServiceRequestInput = z.infer<typeof ownerServiceRequestSchema>;

/** Validates `POST /api/site-pin`. The PIN itself is 4-8 digits at the DB layer; kept loose here since a mismatch is just `ok: false`, never a hint. */
export const sitePinSchema = z.object({
  qrToken: z.string().min(1).max(200),
  pin: z.string().trim().min(1, "Enter the code").max(20),
});

export type SitePinInput = z.infer<typeof sitePinSchema>;

/**
 * localStorage key holding the opaque `site_pin_passes` token for one
 * location — never the PIN itself (see verify_site_pin() in migration 0025).
 * Scoped per location, not per QR token, so a second machine at the same
 * site reuses the same pass instead of prompting again.
 */
export function sitePinStorageKey(locationId: string): string {
  return `equipqr-site-pin-${locationId}`;
}

/** Discriminated union validating `POST /api/vendor-actions`. `token` is always present; the rest depends on `action`. */
const vendorActionBase = z.object({ token: z.string().min(1).max(200) });

export const vendorActionSchema = z.discriminatedUnion("action", [
  vendorActionBase.extend({
    action: z.literal("acknowledge"),
    note: z.string().trim().max(2000).optional(),
  }),
  vendorActionBase.extend({
    action: z.literal("eta"),
    etaAt: z.string().min(1, "Pick a date and time"),
    note: z.string().trim().max(2000).optional(),
  }),
  vendorActionBase.extend({
    action: z.literal("note"),
    body: z.string().trim().min(2, "Add a bit more detail").max(2000),
  }),
  vendorActionBase.extend({
    action: z.literal("finish"),
    note: z.string().trim().max(2000).optional(),
  }),
  vendorActionBase.extend({
    action: z.literal("decline"),
    reason: z.string().trim().min(2, "Add a reason").max(500),
  }),
]);

export type VendorActionInput = z.infer<typeof vendorActionSchema>;
