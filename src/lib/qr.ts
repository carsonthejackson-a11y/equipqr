import QRCode from "qrcode";

// Used for "generate a code now" equipment enrollment — same shape as the
// original DB-generated tokens (24 hex chars), just created app-side since
// new equipment no longer writes to the deprecated equipment.qr_token column.
export function generateInstantToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Pre-printed batch codes look like "AB3D-9F2K". Normalizes whatever a
// person typed (spacing, casing, missing dash) into that canonical form.
export function normalizeQrCode(input: string) {
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length !== 8) return cleaned;
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
}

export function getEquipmentPublicUrl(qrToken: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/e/${qrToken}`;
}

export async function generateQrDataUrl(url: string) {
  return QRCode.toDataURL(url, { width: 480, margin: 2 });
}

export async function generateQrSvg(url: string) {
  return QRCode.toString(url, { type: "svg", width: 480, margin: 2 });
}
