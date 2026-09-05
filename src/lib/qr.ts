import QRCode from "qrcode";
import { serverEnv } from "@/lib/env";

// ----------------------------------------------------------------------------
// Short codes
// ----------------------------------------------------------------------------
//
// Every QR code has an 8-character short code drawn from an alphabet with no
// look-alike characters (no 0/O, 1/I/L). It is:
//   - the human-readable code printed on every label ("ABCD-2345"), so a
//     customer with a scratched sticker can type it in;
//   - the URL token for every code created after migration 0013
//     (`/e/ABCD2345` — 15 chars shorter than the legacy 24-hex token, which
//     lets the QR drop a version and hold error-correction level H);
//   - accepted everywhere a token is, with or without the dash, any case.
// Legacy 24-hex tokens and batch "XXXX-XXXX" tokens keep resolving forever.

// The pure short-code helpers live in src/lib/short-code.ts so client
// components can use them without pulling the `qrcode` renderer (and
// serverEnv) into the browser bundle. Re-exported here so every existing
// `from "@/lib/qr"` import keeps working.
export {
  SHORT_CODE_ALPHABET,
  SHORT_CODE_LENGTH,
  formatShortCode,
  generateShortCode,
  normalizeQrCode,
  normalizeShortCode,
} from "@/lib/short-code";

import { normalizeQrCode, normalizeShortCode } from "@/lib/short-code";

/**
 * @deprecated Legacy 24-hex instant tokens. Kept only so anything still
 * importing it compiles; new codes use generateShortCode() for both token and
 * short_code. Will be removed once no caller remains.
 */
export function generateInstantToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ----------------------------------------------------------------------------
// URLs
// ----------------------------------------------------------------------------

/** Public scan URL for a code. Pass `token` for legacy codes and `short_code` for new ones — resolve_qr_code accepts both. */
export function getEquipmentPublicUrl(qrToken: string) {
  const base = serverEnv.NEXT_PUBLIC_APP_URL;
  return `${base}/e/${qrToken}`;
}

/** Public status-page URL for a service request. */
export function getRequestStatusUrl(publicToken: string) {
  const base = serverEnv.NEXT_PUBLIC_APP_URL;
  return `${base}/r/${publicToken}`;
}

/**
 * Every value worth looking up for something a person typed or pasted into the
 * staff "enter a code" box, most specific first: the 8-char short code printed
 * on every label since migration 0013, the canonical batch form "XXXX-XXXX",
 * and the input itself (a legacy 24-hex instant token). Accepts a whole
 * `/e/<token>` URL off a sticker by taking its last path segment.
 *
 * Output is restricted to `[A-Za-z0-9-]` so callers can safely interpolate it
 * into a PostgREST `.or()` filter, where a comma or parenthesis would
 * otherwise change the query's meaning.
 */
export function qrLookupCandidates(input: string): string[] {
  const trimmed = input.trim();
  if (!trimmed) return [];

  // Drop any query string / fragment before taking the last path segment, so
  // ".../e/ABCD2345?utm=x" yields the code and not "utm=x".
  const path = trimmed.split(/[?#]/)[0];
  const lastSegment = path.split("/").filter(Boolean).pop() ?? path;
  const safeRaw = /^[A-Za-z0-9-]{1,64}$/.test(lastSegment) ? lastSegment : null;

  return [
    ...new Set(
      [normalizeShortCode(lastSegment), normalizeQrCode(lastSegment), safeRaw].filter(
        (value): value is string => !!value && /^[A-Za-z0-9-]{1,64}$/.test(value)
      )
    ),
  ];
}

/**
 * Download filename (no extension) for a unit's QR code, e.g.
 * "break-room-water-heater-abcd2345". Kept to `[a-z0-9-]` so it needs no
 * quoting or escaping in a Content-Disposition header.
 */
export function qrFileSlug(equipmentName: string, shortCode: string): string {
  const slug =
    equipmentName
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 60)
      .replace(/-+$/g, "") || "equipment";
  const code = shortCode.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return code ? `${slug}-${code}` : slug;
}

// ----------------------------------------------------------------------------
// Code history
// ----------------------------------------------------------------------------

/**
 * How a superseded code is described in the equipment page's history list.
 * The user-facing wording lives in qr-card.tsx — this module is imported by
 * server code that also pulls in the `qrcode` renderer, so it stays out of
 * client bundles.
 */
export type PreviousCodeState = "replaced" | "retired" | "moved";

/**
 * Works out what a non-active code means *for a given unit*.
 *
 * Two DB details make this less obvious than `code.status`:
 * - `retire_qr_code()` nulls `equipment_id`, so a retired code no longer
 *   points at the unit it was retired from (we find it again via the unit's
 *   `code_retired` timeline event).
 * - `reassign_qr_code()` leaves the code `active`, just pointed somewhere
 *   else — from this unit's perspective it was moved away, not retired.
 */
export function previousCodeState(
  code: { status: string; equipment_id: string | null },
  equipmentId: string
): PreviousCodeState {
  if (code.status === "retired") return "retired";
  if (code.equipment_id && code.equipment_id !== equipmentId) return "moved";
  return "replaced";
}

// ----------------------------------------------------------------------------
// Rendering
// ----------------------------------------------------------------------------
//
// Error-correction level H (30% recoverable) everywhere: stickers on
// equipment get scuffed, splashed, and partly covered. With a short-code URL
// (~30 chars) that still fits in a Version 3 symbol, so the modules stay big
// enough to scan from a phone at arm's length on a 1" label.

export const QR_ERROR_CORRECTION = "H" as const;

export type QrRenderOptions = {
  /** Pixel width for PNG data URLs. Ignored for SVG (which is scalable). */
  width?: number;
  /** Quiet-zone modules around the symbol. 4 is the spec minimum for reliable scanning. */
  margin?: number;
  /** Foreground colour (hex). Keep dark — light-on-dark QR codes scan poorly. */
  color?: string;
};

export async function generateQrDataUrl(url: string, options: QrRenderOptions = {}) {
  return QRCode.toDataURL(url, {
    width: options.width ?? 480,
    margin: options.margin ?? 4,
    errorCorrectionLevel: QR_ERROR_CORRECTION,
    color: { dark: options.color ?? "#000000", light: "#ffffff" },
  });
}

export async function generateQrSvg(url: string, options: QrRenderOptions = {}) {
  return QRCode.toString(url, {
    type: "svg",
    width: options.width ?? 480,
    margin: options.margin ?? 4,
    errorCorrectionLevel: QR_ERROR_CORRECTION,
    color: { dark: options.color ?? "#000000", light: "#ffffff" },
  });
}

/** Raw PNG bytes (for PDF label sheets and file downloads). */
export async function generateQrPngBuffer(url: string, options: QrRenderOptions = {}): Promise<Buffer> {
  return QRCode.toBuffer(url, {
    type: "png",
    width: options.width ?? 600,
    margin: options.margin ?? 4,
    errorCorrectionLevel: QR_ERROR_CORRECTION,
    color: { dark: options.color ?? "#000000", light: "#ffffff" },
  });
}
