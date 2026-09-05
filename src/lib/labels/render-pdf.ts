import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type PDFImage } from "pdf-lib";
import { formatShortCode, generateQrPngBuffer, getEquipmentPublicUrl } from "@/lib/qr";
import {
  cellRect,
  labelsPerSheet,
  sheetCount,
  truncateToWidth,
  type LabelRect,
  type LabelTemplate,
} from "./templates";
import { sanitizeLabelText } from "./text";

/** One sticker's worth of content. `qrValue` is the code's URL token or short code — whatever the QR should encode. */
export type LabelInput = {
  qrValue: string;
  shortCode: string;
  equipmentName: string;
};

export type RenderLabelSheetInput = {
  template: LabelTemplate;
  labels: LabelInput[];
  companyName: string;
  companyPhone?: string | null;
  /** Skip this many cells on the first sheet so a part-used sheet can be finished off. */
  startOffset?: number;
};

// Never go below 6pt: smaller than that and a laser printer's toner spread
// makes the short code unreadable, which defeats the point of printing it.
const MIN_FONT_SIZE = 6;

const PADDING = 5;
const LINE_HEIGHT_RATIO = 1.2;
const BASELINE_RATIO = 0.95;

type Color = ReturnType<typeof rgb>;
type Fonts = { regular: PDFFont; bold: PDFFont; mono: PDFFont };

type StackLine = {
  text: string;
  font: PDFFont;
  size: number;
  color?: Color;
  /** Extra leading above this line, in points. */
  gapBefore?: number;
};

function lineHeight(line: StackLine) {
  return (line.gapBefore ?? 0) + Math.max(MIN_FONT_SIZE, line.size) * LINE_HEIGHT_RATIO;
}

const MUTED = rgb(0.35, 0.35, 0.35);

/**
 * Draws a stack of lines vertically centred on `centerY`, each truncated to
 * `width` and sanitised for the WinAnsi standard fonts. Centring rather than
 * top-anchoring matters on the 1"-tall Avery 5160, where a top-anchored block
 * leaves a third of the sticker blank.
 */
function drawStack(
  page: PDFPage,
  lines: StackLine[],
  options: { x: number; width: number; centerY: number; align: "left" | "center" }
) {
  const visible = lines.filter((line) => line.text.trim().length > 0);
  if (visible.length === 0) return;

  const total = visible.reduce((sum, line) => sum + lineHeight(line), 0);
  let top = options.centerY + total / 2;

  for (const line of visible) {
    const size = Math.max(MIN_FONT_SIZE, line.size);
    const fitted = truncateToWidth(sanitizeLabelText(line.text), options.width, (candidate) =>
      line.font.widthOfTextAtSize(candidate, size)
    );
    const baseline = top - (line.gapBefore ?? 0) - size * BASELINE_RATIO;

    if (fitted) {
      const x =
        options.align === "center"
          ? options.x + (options.width - line.font.widthOfTextAtSize(fitted, size)) / 2
          : options.x;
      page.drawText(fitted, {
        x,
        y: baseline,
        size,
        font: line.font,
        color: line.color ?? rgb(0, 0, 0),
      });
    }

    top -= lineHeight(line);
  }
}

/**
 * Renders one label into its cell. Three layouts, keyed off the template's
 * `variant`, because a 1" address label and a 4"x2" shipping label want
 * genuinely different arrangements rather than one scaled to fit.
 */
function drawLabel(
  page: PDFPage,
  rect: LabelRect,
  qr: PDFImage,
  label: LabelInput,
  fonts: Fonts,
  context: { companyName: string; companyPhone?: string | null; variant: LabelTemplate["variant"] }
) {
  const code = formatShortCode(label.shortCode);
  const name = sanitizeLabelText(label.equipmentName, "Equipment");

  if (context.variant === "square") {
    // 2" x 2": QR on top, text stacked and centred beneath it.
    const textBand = 30;
    const qrSize = Math.min(rect.width - PADDING * 2, rect.height - PADDING * 2 - textBand);
    page.drawImage(qr, {
      x: rect.x + (rect.width - qrSize) / 2,
      y: rect.y + rect.height - PADDING - qrSize,
      width: qrSize,
      height: qrSize,
    });

    drawStack(
      page,
      [
        { text: name, font: fonts.bold, size: 8 },
        { text: code, font: fonts.mono, size: 10, gapBefore: 1 },
        ...(context.companyPhone
          ? [{ text: context.companyPhone, font: fonts.regular, size: 6, color: MUTED }]
          : []),
      ],
      {
        x: rect.x + PADDING,
        width: rect.width - PADDING * 2,
        centerY: rect.y + (rect.height - PADDING - qrSize) / 2,
        align: "center",
      }
    );
    return;
  }

  // compact + standard: QR on the left, text column on the right.
  const qrSize = rect.height - PADDING * 2;
  page.drawImage(qr, { x: rect.x + PADDING, y: rect.y + PADDING, width: qrSize, height: qrSize });

  const textX = rect.x + PADDING + qrSize + PADDING;
  const width = rect.x + rect.width - PADDING - textX;
  const centerY = rect.y + rect.height / 2;

  const lines: StackLine[] =
    context.variant === "compact"
      ? // 1" tall: name, prompt, code. Anything more is unreadable at this size.
        [
          { text: name, font: fonts.bold, size: 9 },
          { text: "Scan for help & service", font: fonts.regular, size: 6, color: MUTED },
          { text: code, font: fonts.mono, size: 11, gapBefore: 2 },
        ]
      : // 4" x 2": the full sticker.
        [
          { text: context.companyName, font: fonts.bold, size: 11 },
          { text: name, font: fonts.regular, size: 9 },
          { text: "Scan for help & service", font: fonts.regular, size: 7, color: MUTED },
          { text: code, font: fonts.mono, size: 14, gapBefore: 3 },
          ...(context.companyPhone
            ? [{ text: `Call ${context.companyPhone}`, font: fonts.regular, size: 7, color: MUTED }]
            : []),
        ];

  drawStack(page, lines, { x: textX, width, centerY, align: "left" });
}

/**
 * Builds an Avery label sheet PDF. The only I/O is QR rasterisation, so this
 * can be exercised end to end from a unit test with fixture labels.
 */
export async function renderLabelSheetPdf(input: RenderLabelSheetInput): Promise<Uint8Array> {
  const { template, labels } = input;
  const perSheet = labelsPerSheet(template);
  const startOffset = Math.max(0, Math.min(input.startOffset ?? 0, perSheet - 1));

  const pdf = await PDFDocument.create();
  pdf.setTitle(`${sanitizeLabelText(input.companyName, "EquipQR")} - QR labels`);
  pdf.setCreator("EquipQR");

  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    mono: await pdf.embedFont(StandardFonts.CourierBold),
  };

  const pages: PDFPage[] = [];
  for (let i = 0; i < Math.max(1, sheetCount(template, labels.length + startOffset)); i++) {
    pages.push(pdf.addPage([template.page.width, template.page.height]));
  }

  // Rasterise every QR up front rather than inside the layout loop — a full
  // 30-up sheet is 30 PNG encodes, and running them concurrently is the
  // difference between a snappy download and a request timeout.
  const images = await Promise.all(
    labels.map(async (label) => {
      const png = await generateQrPngBuffer(getEquipmentPublicUrl(label.qrValue), { width: 600 });
      return pdf.embedPng(new Uint8Array(png));
    })
  );

  labels.forEach((label, i) => {
    const position = i + startOffset;
    const page = pages[Math.floor(position / perSheet)];
    drawLabel(page, cellRect(template, position % perSheet), images[i], label, fonts, {
      companyName: input.companyName,
      companyPhone: input.companyPhone,
      variant: template.variant,
    });
  });

  return pdf.save();
}
