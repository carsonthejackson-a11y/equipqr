// Size presets for the single-sticker print page
// (/dashboard/equipment/[id]/label?size=...).
//
// These drive a CSS `@page { size: <w>in <h>in; margin: 0 }` rule, so the
// browser's print dialog defaults to the right paper and the sticker comes out
// at true scale on a label printer (Dymo/Brother/Rollo) or on a sheet cut to
// size. Inches, not points: CSS speaks inches and the printer dialog does too.

export const STICKER_SIZE_IDS = ["2x2", "3x2", "1x1"] as const;
export type StickerSizeId = (typeof STICKER_SIZE_IDS)[number];

export type StickerSize = {
  id: StickerSizeId;
  /** Shown on the size switcher. */
  name: string;
  description: string;
  widthIn: number;
  heightIn: number;
  /** QR edge length in inches — the rest of the layout flows around it. */
  qrIn: number;
  /**
   * `full` prints the whole sticker (logo/company, name, prompt, code,
   * caption, phone, location). `minimal` is QR + short code only, for a 1"
   * square where anything else would be unreadable.
   */
  layout: "full" | "minimal";
};

export const STICKER_SIZES: Record<StickerSizeId, StickerSize> = {
  "2x2": {
    id: "2x2",
    name: '2" × 2"',
    description: "Square — the default sticker",
    widthIn: 2,
    heightIn: 2,
    qrIn: 1.05,
    layout: "full",
  },
  "3x2": {
    id: "3x2",
    name: '3" × 2"',
    description: "Wide — most room for contact details",
    widthIn: 3,
    heightIn: 2,
    qrIn: 1.3,
    layout: "full",
  },
  "1x1": {
    id: "1x1",
    name: '1" × 1"',
    description: "Minimal — QR and code only",
    widthIn: 1,
    heightIn: 1,
    qrIn: 0.68,
    layout: "minimal",
  },
};

export const DEFAULT_STICKER_SIZE_ID: StickerSizeId = "2x2";

export const STICKER_SIZE_LIST: StickerSize[] = STICKER_SIZE_IDS.map((id) => STICKER_SIZES[id]);

export function isStickerSizeId(value: unknown): value is StickerSizeId {
  return typeof value === "string" && (STICKER_SIZE_IDS as readonly string[]).includes(value);
}

/** Falls back to the default rather than throwing — the id comes from a query string. */
export function getStickerSize(value: unknown): StickerSize {
  return isStickerSizeId(value) ? STICKER_SIZES[value] : STICKER_SIZES[DEFAULT_STICKER_SIZE_ID];
}

/**
 * Zeroes the padding the dashboard shell puts around page content. Without it
 * the sticker prints inset by `main`'s padding and no longer lines up with a
 * die-cut label. Scoped to whichever page renders this CSS.
 */
export const STICKER_PRINT_RESET =
  "@media print { body { margin: 0 !important; } main { padding: 0 !important; } }";

/** The `@page` rule that makes the browser print dialog default to this sticker's paper size. */
export function stickerPageCss(size: StickerSize): string {
  return `@page { size: ${size.widthIn}in ${size.heightIn}in; margin: 0; } ${STICKER_PRINT_RESET}`;
}

/**
 * Host part of the app URL, for the "or enter this code at <host>" caption.
 * Falls back to the raw string when it isn't parseable as a URL.
 */
export function appHost(appUrl: string): string {
  try {
    return new URL(appUrl).host.replace(/^www\./, "");
  } catch {
    return appUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  }
}
