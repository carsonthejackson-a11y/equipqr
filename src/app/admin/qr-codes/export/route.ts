import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEquipmentPublicUrl } from "@/lib/qr";
import type { QrCode } from "@/lib/types";
import { FEATURES } from "@/lib/features";

export async function GET(request: NextRequest) {
  // Route handlers aren't wrapped by admin/layout.tsx's notFound() gate, so
  // this needs its own check. See docs/BATCH-QR.md.
  if (!FEATURES.batchQr) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: isAdmin } = await supabase.rpc("is_platform_admin");

  if (!isAdmin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const companyId = request.nextUrl.searchParams.get("company");

  if (!companyId) {
    return NextResponse.json({ error: "Missing company" }, { status: 400 });
  }

  const { data: codes } = await supabase
    .from("qr_codes")
    .select("*")
    .eq("company_id", companyId)
    .eq("source", "batch")
    .order("created_at", { ascending: false })
    .returns<QrCode[]>();

  const rows = [
    ["token", "url", "status"],
    ...(codes ?? []).map((c) => [
      c.token,
      getEquipmentPublicUrl(c.token),
      c.equipment_id ? "claimed" : "unclaimed",
    ]),
  ];

  const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="qr-codes-${companyId}.csv"`,
    },
  });
}
