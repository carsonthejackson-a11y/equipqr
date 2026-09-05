import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { sanitizeLabelText } from "./text";

describe("sanitizeLabelText", () => {
  it("leaves plain ASCII alone", () => {
    expect(sanitizeLabelText("Break room water heater")).toBe("Break room water heater");
  });

  it("keeps Latin-1 accents, which WinAnsi can encode", () => {
    expect(sanitizeLabelText("Café Noël")).toBe("Café Noël");
  });

  it("keeps typographic punctuation WinAnsi covers", () => {
    expect(sanitizeLabelText("Boiler — “A” … ’99")).toBe("Boiler — “A” … ’99");
  });

  it("strips characters no standard font can encode", () => {
    expect(sanitizeLabelText("Chiller 🙂")).toBe("Chiller");
    expect(sanitizeLabelText("冷蔵庫 A")).toBe("A");
  });

  it("transliterates look-alike punctuation", () => {
    expect(sanitizeLabelText("6′ unit")).toBe("6' unit");
    expect(sanitizeLabelText("2×4 rack")).toBe("2x4 rack");
  });

  it("collapses whitespace and trims", () => {
    expect(sanitizeLabelText("  Roof \n unit  A ")).toBe("Roof unit A");
  });

  it("falls back when nothing printable survives", () => {
    expect(sanitizeLabelText("日本語", "Equipment")).toBe("Equipment");
    expect(sanitizeLabelText(null, "Equipment")).toBe("Equipment");
    expect(sanitizeLabelText(undefined)).toBe("");
    expect(sanitizeLabelText("   ")).toBe("");
  });
});

describe("sanitizeLabelText output is drawable by pdf-lib", () => {
  const samples = [
    "Break room water heater",
    "Café Noël",
    "Boiler — “A” … ’99",
    "Chiller 🙂",
    "冷蔵庫 A",
    "Ünit ✔ ①",
    "2×4 rack ′",
  ];

  it("never throws a WinAnsi encoding error", async () => {
    const pdf = await PDFDocument.create();
    const helvetica = await pdf.embedFont(StandardFonts.Helvetica);
    const courier = await pdf.embedFont(StandardFonts.CourierBold);
    const page = pdf.addPage([300, 300]);

    for (const sample of samples) {
      const safe = sanitizeLabelText(sample, "Equipment");
      expect(() => page.drawText(safe, { x: 10, y: 10, size: 8, font: helvetica })).not.toThrow();
      expect(() => page.drawText(safe, { x: 10, y: 10, size: 8, font: courier })).not.toThrow();
    }
  });
});
