// Avery label-sheet geometry, in PDF points (1in = 72pt), origin bottom-left.
//
// Pure module on purpose: every number here is checkable arithmetic (margins +
// labels + gutters must add up to exactly 8.5" x 11"), and the PDF renderer in
// ./render-pdf.ts does nothing but place content into the rects this file
// produces. See src/lib/labels/templates.test.ts.
//
// Dimensions come from Avery's published product specs. Where a spec gives a
// side margin only implicitly, it is derived from the sheet width so the
// columns stay centred — the invariants test asserts that.

export const POINTS_PER_INCH = 72;

/** US Letter, the only sheet size these templates use. */
export const LETTER_PAGE = {
  width: 8.5 * POINTS_PER_INCH,
  height: 11 * POINTS_PER_INCH,
} as const;

export const LABEL_TEMPLATE_IDS = ["avery5160", "avery5163", "avery22806"] as const;
export type LabelTemplateId = (typeof LABEL_TEMPLATE_IDS)[number];

/**
 * How much fits in one cell. Drives the renderer's layout branch:
 * - `compact`: QR + name + short code only (a 1" tall label has no room for more)
 * - `standard`: wide enough for QR beside a stacked name / prompt / code / phone
 * - `square`: QR stacked above the text
 */
export type LabelCellVariant = "compact" | "standard" | "square";

export type LabelTemplate = {
  id: LabelTemplateId;
  /** Shown in the template picker. */
  name: string;
  /** One-line hint under the picker. */
  description: string;
  page: { width: number; height: number };
  /** One label's printable area. */
  label: { width: number; height: number };
  columns: number;
  rows: number;
  /** Distance from the sheet's left/top edge to the first label's left/top edge. */
  margin: { left: number; top: number };
  /** Centre-to-centre (really left-to-left / top-to-top) step between labels. */
  pitch: { x: number; y: number };
  variant: LabelCellVariant;
};

function inches(value: number) {
  return value * POINTS_PER_INCH;
}

export const LABEL_TEMPLATES: Record<LabelTemplateId, LabelTemplate> = {
  // 2.625" x 1", 3 across x 10 down. The classic address label; the smallest
  // sticker we support and the cheapest to buy.
  avery5160: {
    id: "avery5160",
    name: "Avery 5160",
    description: '30 per sheet — 2.625" × 1" address labels',
    page: { ...LETTER_PAGE },
    label: { width: inches(2.625), height: inches(1) },
    columns: 3,
    rows: 10,
    margin: { left: inches(0.1875), top: inches(0.5) },
    pitch: { x: inches(2.75), y: inches(1) },
    variant: "compact",
  },
  // 4" x 2", 2 across x 5 down. Enough room for the full sticker treatment.
  avery5163: {
    id: "avery5163",
    name: "Avery 5163",
    description: '10 per sheet — 4" × 2" shipping labels',
    page: { ...LETTER_PAGE },
    label: { width: inches(4), height: inches(2) },
    columns: 2,
    rows: 5,
    margin: { left: inches(0.15625), top: inches(0.5) },
    pitch: { x: inches(4.1875), y: inches(2) },
    variant: "standard",
  },
  // 2" x 2" square, 3 across x 4 down. Best match for the shape of a QR code.
  avery22806: {
    id: "avery22806",
    name: "Avery 22806",
    description: '12 per sheet — 2" × 2" square labels',
    page: { ...LETTER_PAGE },
    label: { width: inches(2), height: inches(2) },
    columns: 3,
    rows: 4,
    margin: { left: inches(0.5), top: inches(0.5) },
    pitch: { x: inches(2.75), y: inches(2.5) },
    variant: "square",
  },
};

export const LABEL_TEMPLATE_LIST: LabelTemplate[] = LABEL_TEMPLATE_IDS.map(
  (id) => LABEL_TEMPLATES[id]
);

export const DEFAULT_LABEL_TEMPLATE_ID: LabelTemplateId = "avery5160";

export function isLabelTemplateId(value: unknown): value is LabelTemplateId {
  return typeof value === "string" && (LABEL_TEMPLATE_IDS as readonly string[]).includes(value);
}

/** Falls back to the default template rather than throwing — callers get their id from a query string or form field. */
export function getLabelTemplate(value: unknown): LabelTemplate {
  return isLabelTemplateId(value) ? LABEL_TEMPLATES[value] : LABEL_TEMPLATES[DEFAULT_LABEL_TEMPLATE_ID];
}

export function labelsPerSheet(template: LabelTemplate): number {
  return template.columns * template.rows;
}

export function sheetCount(template: LabelTemplate, labelCount: number): number {
  if (labelCount <= 0) return 0;
  return Math.ceil(labelCount / labelsPerSheet(template));
}

/** A label's box on the page, in PDF coordinates (origin bottom-left, y grows upward). */
export type LabelRect = { x: number; y: number; width: number; height: number };

/**
 * Position of the `index`-th label on a sheet, filling left-to-right then
 * top-to-bottom (the order a sheet feeds through a printer).
 * `index` is 0-based and must be < labelsPerSheet(template).
 */
export function cellRect(template: LabelTemplate, index: number): LabelRect {
  const perSheet = labelsPerSheet(template);
  if (!Number.isInteger(index) || index < 0 || index >= perSheet) {
    throw new RangeError(`Label index ${index} is outside 0..${perSheet - 1} for ${template.id}`);
  }

  const column = index % template.columns;
  const row = Math.floor(index / template.columns);

  const x = template.margin.left + column * template.pitch.x;
  // PDF y is measured from the bottom, but label rows are counted from the
  // top — so convert once, here, and let everything downstream stay in PDF
  // coordinates.
  const topFromPageTop = template.margin.top + row * template.pitch.y;
  const y = template.page.height - topFromPageTop - template.label.height;

  return { x, y, width: template.label.width, height: template.label.height };
}

export type LabelSlot = LabelRect & {
  /** 0-based sheet number. */
  page: number;
  /** 0-based position within that sheet. */
  index: number;
};

/** Lays `count` labels out across as many sheets as it takes. */
export function labelSlots(template: LabelTemplate, count: number): LabelSlot[] {
  const perSheet = labelsPerSheet(template);
  const slots: LabelSlot[] = [];
  for (let i = 0; i < count; i++) {
    const index = i % perSheet;
    slots.push({ page: Math.floor(i / perSheet), index, ...cellRect(template, index) });
  }
  return slots;
}

/**
 * Trims `text` until it fits `maxWidth`, appending an ellipsis when anything
 * was cut. `measure` is injected so this stays pure and testable — the PDF
 * renderer passes a pdf-lib font's widthOfTextAtSize.
 */
export function truncateToWidth(
  text: string,
  maxWidth: number,
  measure: (candidate: string) => number
): string {
  if (maxWidth <= 0) return "";
  if (measure(text) <= maxWidth) return text;

  const ellipsis = "…";
  if (measure(ellipsis) > maxWidth) return "";

  let cut = text.length;
  while (cut > 0) {
    cut -= 1;
    const candidate = `${text.slice(0, cut).trimEnd()}${ellipsis}`;
    if (measure(candidate) <= maxWidth) return candidate;
  }
  return ellipsis;
}
