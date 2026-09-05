// @vitest-environment node
//
// render-pdf.ts is server-only (it imports "server-only", which throws under
// the project's default jsdom environment) and the PDF/QR pipeline is Node
// code anyway.
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { LABEL_TEMPLATES, labelsPerSheet, type LabelTemplateId } from "./templates";

// The `server-only` package throws unless it is resolved under Next's
// "react-server" export condition, which the test runner doesn't set. Stubbing
// it is the standard way to unit-test a server module.
vi.mock("server-only", () => ({}));

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  vi.resetModules();
  process.env = {
    ...ORIGINAL_ENV,
    NEXT_PUBLIC_APP_URL: "https://app.equipqr.co",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  };
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

function labels(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    qrValue: `ABCD234${i % 10}`,
    shortCode: `ABCD234${i % 10}`,
    equipmentName: `Unit ${i + 1} — break room water heater with a very long name`,
  }));
}

describe("renderLabelSheetPdf", () => {
  for (const id of Object.keys(LABEL_TEMPLATES) as LabelTemplateId[]) {
    it(`renders a valid single-sheet PDF for ${id}`, async () => {
      const { renderLabelSheetPdf } = await import("./render-pdf");
      const template = LABEL_TEMPLATES[id];

      const bytes = await renderLabelSheetPdf({
        template,
        labels: labels(3),
        companyName: "Acme Coffee Service",
        companyPhone: "(555) 010-2020",
      });

      const parsed = await PDFDocument.load(bytes);
      expect(parsed.getPageCount()).toBe(1);
      const [page] = parsed.getPages();
      expect(page.getWidth()).toBeCloseTo(template.page.width, 3);
      expect(page.getHeight()).toBeCloseTo(template.page.height, 3);
    }, 20_000);
  }

  it("spills onto a second sheet once the first is full", async () => {
    const { renderLabelSheetPdf } = await import("./render-pdf");
    const template = LABEL_TEMPLATES.avery22806; // 12 up

    const bytes = await renderLabelSheetPdf({
      template,
      labels: labels(labelsPerSheet(template) + 1),
      companyName: "Acme Coffee Service",
    });

    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBe(2);
  }, 30_000);

  it("still produces one page for an empty selection", async () => {
    const { renderLabelSheetPdf } = await import("./render-pdf");
    const bytes = await renderLabelSheetPdf({
      template: LABEL_TEMPLATES.avery5160,
      labels: [],
      companyName: "Acme",
    });
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBe(1);
  });

  it("does not throw on names a standard PDF font cannot encode", async () => {
    const { renderLabelSheetPdf } = await import("./render-pdf");
    const bytes = await renderLabelSheetPdf({
      template: LABEL_TEMPLATES.avery5163,
      labels: [
        { qrValue: "ABCD2345", shortCode: "ABCD2345", equipmentName: "冷蔵庫 🙂" },
        { qrValue: "EFGH6789", shortCode: "EFGH6789", equipmentName: "Café Noël" },
      ],
      companyName: "Café 冷蔵 Service",
      companyPhone: "(555) 010-2020",
    });
    expect(bytes.byteLength).toBeGreaterThan(0);
  }, 20_000);
});
