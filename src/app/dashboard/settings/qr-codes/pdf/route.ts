import { NextResponse, type NextRequest } from "next/server";
import { requireOwner } from "@/lib/auth";
import { getEntitlements, hasFeature } from "@/lib/billing";
import { FEATURES } from "@/lib/features";
import { createClient } from "@/lib/supabase/server";
import { getLabelTemplate } from "@/lib/labels/templates";
import { renderLabelSheetPdf, type LabelInput } from "@/lib/labels/render-pdf";
import type { Company, QrCode } from "@/lib/types";

// Same cap as the equipment label-sheet route — one accidental select-all
// shouldn't tie up a serverless function rasterising hundreds of QR codes.
const MAX_LABELS = 300;

export async function POST(request: NextRequest) {
  const ctx = await requireOwner();
  if (!ctx) {
    return NextResponse.json({ error: "Only company owners can print blank codes." }, { status: 403 });
  }

  const entitlements = await getEntitlements();
  if (!FEATURES.batchQr || !hasFeature(entitlements, "batchQr")) {
    return NextResponse.json(
      { error: "Blank code batches are available on the Pro plan." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { templateId, codeIds } = (body ?? {}) as { templateId?: unknown; codeIds?: unknown };

  if (!Array.isArray(codeIds) || codeIds.length === 0 || codeIds.some((id) => typeof id !== "string")) {
    return NextResponse.json({ error: "Choose at least one code to print." }, { status: 400 });
  }
  if (codeIds.length > MAX_LABELS) {
    return NextResponse.json(
      { error: `That's more than ${MAX_LABELS} labels. Print in smaller batches.` },
      { status: 400 }
    );
  }

  const template = getLabelTemplate(templateId);
  const supabase = await createClient();

  // RLS scopes this to the caller's own company, so a foreign id simply
  // doesn't come back. Still-unclaimed batch codes only — anything already
  // linked to a unit belongs on the equipment label sheet instead.
  const { data: codes } = await supabase
    .from("qr_codes")
    .select("*")
    .in("id", codeIds as string[])
    .eq("company_id", ctx.company.id)
    .eq("source", "batch")
    .eq("status", "active")
    .is("equipment_id", null)
    .returns<QrCode[]>();

  const usableCodes = codes ?? [];
  if (usableCodes.length === 0) {
    return NextResponse.json({ error: "None of those codes are available to print." }, { status: 404 });
  }

  const { data: company } = await supabase
    .from("companies")
    .select("name, phone")
    .eq("id", ctx.company.id)
    .maybeSingle<Pick<Company, "name" | "phone">>();

  // Keep the order the user saw on screen.
  const order = new Map((codeIds as string[]).map((id, index) => [id, index]));
  const labels: LabelInput[] = usableCodes
    .slice()
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((code) => ({
      // Legacy 24-hex tokens don't apply here (blank pool codes are all
      // post-migration-0013), but keep the same "encode the row's own
      // token" rule the equipment label sheet follows.
      qrValue: code.token,
      shortCode: code.short_code,
      // No equipmentName: this is what tells the renderer it's a blank
      // (unclaimed) code, printing the company name and a "scan to set up"
      // prompt instead of a unit name.
    }));

  const pdf = await renderLabelSheetPdf({
    template,
    labels,
    companyName: company?.name ?? ctx.company.name,
    companyPhone: company?.phone ?? null,
  });

  // Best-effort: a failed stamp shouldn't cost the owner their PDF.
  const { error: stampError } = await supabase
    .from("qr_codes")
    .update({ label_printed_at: new Date().toISOString() })
    .in(
      "id",
      usableCodes.map((code) => code.id)
    );

  if (stampError) {
    console.error("label_printed_at stamp failed:", stampError.message);
  }

  const sheets = Math.ceil(labels.length / (template.columns * template.rows));

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="equipqr-blank-labels-${template.id}-${sheets}-sheet${sheets === 1 ? "" : "s"}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
