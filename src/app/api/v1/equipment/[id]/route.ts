// Security model: service-role client (`auth.ctx.admin`) with NO RLS on
// this request. Every query below is filtered by `auth.ctx.companyId` —
// that filter is the entire tenant isolation for this endpoint.
import { authenticateApiRequest } from "@/lib/api-auth";
import { formatShortCode } from "@/lib/qr";
import type { Equipment, EquipmentDocument, EquipmentEvent, QrCode } from "@/lib/types";
import { equipmentPhotoUrl, jsonData, jsonError, scanUrlFor } from "../../shared";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiRequest(request, "read");
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const { data: equipment, error } = await auth.ctx.admin
    .from("equipment")
    .select("*")
    .eq("id", id)
    .eq("company_id", auth.ctx.companyId)
    .maybeSingle<Equipment>();

  if (error) return jsonError(error.message, 500);
  if (!equipment) return jsonError("Equipment not found", 404);

  const [{ data: code }, { data: documents }, { data: events }] = await Promise.all([
    auth.ctx.admin
      .from("qr_codes")
      .select("*")
      .eq("equipment_id", id)
      .eq("company_id", auth.ctx.companyId)
      .eq("status", "active")
      .maybeSingle<QrCode>(),
    auth.ctx.admin
      .from("equipment_documents")
      .select("id, file_name, mime_type, size_bytes, created_at")
      .eq("equipment_id", id)
      .eq("company_id", auth.ctx.companyId)
      .order("created_at", { ascending: false })
      .returns<Pick<EquipmentDocument, "id" | "file_name" | "mime_type" | "size_bytes" | "created_at">[]>(),
    auth.ctx.admin
      .from("equipment_events")
      .select("*")
      .eq("equipment_id", id)
      .eq("company_id", auth.ctx.companyId)
      .order("occurred_at", { ascending: false })
      .limit(20)
      .returns<EquipmentEvent[]>(),
  ]);

  return jsonData({
    ...equipment,
    photo_url: equipmentPhotoUrl(equipment.photo_path),
    code: code
      ? { short_code: formatShortCode(code.short_code), public_url: scanUrlFor(code.short_code) }
      : null,
    documents: documents ?? [],
    events: events ?? [],
  });
}
