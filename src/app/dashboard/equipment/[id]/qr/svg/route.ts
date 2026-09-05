import { NextResponse } from "next/server";
import { generateQrSvg } from "@/lib/qr";
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

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Content-Disposition": `attachment; filename="${code.fileName}.svg"`,
      "Cache-Control": "private, no-store",
    },
  });
}
