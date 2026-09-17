import { NextResponse, after } from "next/server";
import { generateQrSvg } from "@/lib/qr";
import { markLabelPrinted } from "../../qr-actions";
import { loadDownloadableCode } from "../code";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const code = await loadDownloadableCode(id);

  if (!code) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // SVG is the format to hand a sign shop: vector, so it scales to any sticker
  // size without resampling the modules.
  const svg = await generateQrSvg(code.publicUrl);

  // A downloaded SVG is headed for a label just as surely as the Print
  // button — the "Getting started" checklist and labels page should count
  // it the same way (item 4). markLabelPrinted() is best-effort and never
  // throws; scheduled after the response so the download itself never waits
  // on it.
  after(() => markLabelPrinted([code.codeId], id));

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Content-Disposition": `attachment; filename="${code.fileName}.svg"`,
      "Cache-Control": "private, no-store",
    },
  });
}
