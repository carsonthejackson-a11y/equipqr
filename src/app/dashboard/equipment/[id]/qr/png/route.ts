import { NextResponse, after } from "next/server";
import { generateQrPngBuffer } from "@/lib/qr";
import { markLabelPrinted } from "../../qr-actions";
import { loadDownloadableCode } from "../code";

// 1200px square: big enough to drop into a sign, a manual, or a
// commercially-printed sticker without visible module edges.
const PNG_WIDTH = 1200;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const code = await loadDownloadableCode(id);

  if (!code) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const png = await generateQrPngBuffer(code.publicUrl, { width: PNG_WIDTH });

  // A downloaded PNG is headed for a label just as surely as the Print
  // button — the "Getting started" checklist and labels page should count
  // it the same way (item 4). markLabelPrinted() is best-effort and never
  // throws; scheduled after the response so the download itself never waits
  // on it.
  after(() => markLabelPrinted([code.codeId], id));

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="${code.fileName}.png"`,
      // Per-user, per-code content behind a session: never let a shared cache
      // hold it.
      "Cache-Control": "private, no-store",
    },
  });
}
