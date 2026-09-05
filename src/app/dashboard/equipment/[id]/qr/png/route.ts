import { NextResponse } from "next/server";
import { generateQrPngBuffer } from "@/lib/qr";
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
