import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLabelTemplate, labelsPerSheet } from "@/lib/labels/templates";
import { renderLabelSheetPdf, type LabelInput } from "@/lib/labels/render-pdf";
import type { Company, Equipment, QrCode } from "@/lib/types";

// Cap the request so one accidental "select all" on a huge account can't tie
// up a serverless function rasterising thousands of QR codes. 10 sheets of the
// densest template (Avery 5160, 30-up) is 300 labels.
const MAX_LABELS = 300;

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { templateId, codeIds } = (body ?? {}) as { templateId?: unknown; codeIds?: unknown };

  if (!Array.isArray(codeIds) || codeIds.some((id) => typeof id !== "string")) {
    return NextResponse.json({ error: "Choose at least one unit to print." }, { status: 400 });
  }
  if (codeIds.length === 0) {
    return NextResponse.json({ error: "Choose at least one unit to print." }, { status: 400 });
  }
  if (codeIds.length > MAX_LABELS) {
    return NextResponse.json(
      { error: `That's more than ${MAX_LABELS} labels. Filter the list down and print in batches.` },
      { status: 400 }
    );
  }

  const template = getLabelTemplate(templateId);

  // RLS scopes this to the caller's company, so ids from another tenant simply
  // don't come back — no 403 branch needed, and no way to probe for them.
  const { data: codes } = await supabase
    .from("qr_codes")
    .select("*")
    .in("id", codeIds as string[])
    .eq("status", "active")
    .returns<QrCode[]>();

  const usableCodes = (codes ?? []).filter((code) => code.equipment_id);

  if (usableCodes.length === 0) {
    return NextResponse.json({ error: "None of those codes are still active." }, { status: 404 });
  }

  const [{ data: equipment }, { data: company }] = await Promise.all([
    supabase
      .from("equipment")
      .select("id, name")
      .in("id", usableCodes.map((code) => code.equipment_id!))
      .returns<Pick<Equipment, "id" | "name">[]>(),
    supabase
      .from("companies")
      .select("name, phone")
      .eq("id", usableCodes[0].company_id)
      .maybeSingle<Pick<Company, "name" | "phone">>(),
  ]);

  const nameById = new Map((equipment ?? []).map((unit) => [unit.id, unit.name]));

  // Keep the order the user saw on screen, so the printed sheet matches the
  // list they ticked.
  const order = new Map((codeIds as string[]).map((id, index) => [id, index]));
  const labels: LabelInput[] = usableCodes
    .slice()
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((code) => ({
      // Legacy 24-hex and batch tokens must keep encoding their own token;
      // for codes created since migration 0013 token === short_code anyway.
      qrValue: code.token,
      shortCode: code.short_code,
      equipmentName: nameById.get(code.equipment_id!) ?? "Equipment",
    }));

  const pdf = await renderLabelSheetPdf({
    template,
    labels,
    companyName: company?.name ?? "",
    companyPhone: company?.phone ?? null,
  });

  // Best-effort: a failed stamp shouldn't cost the user their PDF, it only
  // makes the "Label printed" column optimistic.
  const { error: stampError } = await supabase
    .from("qr_codes")
    .update({ label_printed_at: new Date().toISOString() })
    .in("id", usableCodes.map((code) => code.id));

  if (stampError) {
    console.error("label_printed_at stamp failed:", stampError.message);
  }

  const sheets = Math.ceil(labels.length / labelsPerSheet(template));

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="equipqr-labels-${template.id}-${sheets}-sheet${sheets === 1 ? "" : "s"}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
