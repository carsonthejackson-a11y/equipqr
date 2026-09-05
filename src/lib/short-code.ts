// The 8-character short code primitives, split out of src/lib/qr.ts.
//
// qr.ts also imports the `qrcode` renderer and `serverEnv`, so anything a
// *client* component needs from it drags ~150KB of QR-rendering code into the
// browser bundle — including the public /e/<token> scan pages, which have to
// load fast on a phone with one bar. Only these pure string helpers are needed
// on both sides of the boundary, so they live here and qr.ts re-exports them:
// every existing `from "@/lib/qr"` import keeps working unchanged.

export const SHORT_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const SHORT_CODE_LENGTH = 8;

/** Generates a candidate short code. Uniqueness is enforced by the DB (unique index); on the rare collision the insert fails and the caller retries. */
export function generateShortCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(SHORT_CODE_LENGTH));
  return Array.from(bytes, (b) => SHORT_CODE_ALPHABET[b % SHORT_CODE_ALPHABET.length]).join("");
}

/** Strips everything but A–Z/2–9 and uppercases. Returns null when the result can't be a short code. */
export function normalizeShortCode(input: string): string | null {
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return cleaned.length === SHORT_CODE_LENGTH ? cleaned : null;
}

/** "ABCD2345" -> "ABCD-2345" for labels and UI. Passes anything else through untouched. */
export function formatShortCode(code: string): string {
  const normalized = normalizeShortCode(code);
  if (!normalized) return code;
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

// Pre-printed batch codes look like "AB3D-9F2K". Normalizes whatever a
// person typed (spacing, casing, missing dash) into that canonical form.
export function normalizeQrCode(input: string) {
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length !== 8) return cleaned;
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
}
