import { createClient } from "@/lib/supabase/server";
import {
  formatShortCode,
  generateQrDataUrl,
  getEquipmentPublicUrl,
  previousCodeState,
} from "@/lib/qr";
import { getEntitlements, hasFeature } from "@/lib/billing";
import { FEATURES } from "@/lib/features";
import type { Equipment, EquipmentEvent, EquipmentScanStats, QrCode } from "@/lib/types";
import { QrCard, type PreviousCode } from "./qr-card";
import { AssignCodeForm } from "./assign-code-form";

/** Timeline kinds whose `details.qr_code_id` points at a code that used to serve this unit. */
const CODE_HISTORY_EVENT_KINDS = ["code_retired", "code_reassigned"];

/**
 * Self-contained server component for the QR side of the equipment page:
 * fetches the unit's active code, its superseded predecessors, scan stats and
 * the move-target list itself, so the surrounding page only has to render
 * <QrSection equipment={...} />. The QR-hardening workstream owns this file
 * (and qr-card.tsx / assign-code-form.tsx); the equipment-v2 workstream owns
 * page.tsx.
 */
export async function QrSection({ equipment }: { equipment: Equipment }) {
  const supabase = await createClient();

  const [{ data: linkedCodes }, { data: historyEvents }, entitlements, { data: stats }] =
    await Promise.all([
      // A 'replaced' code keeps its equipment_id on purpose (an old sticker
      // still resolves), so this returns the active code plus every code it
      // superseded.
      supabase
        .from("qr_codes")
        .select("*")
        .eq("equipment_id", equipment.id)
        .order("created_at", { ascending: false })
        .returns<QrCode[]>(),
      // Retiring or moving a code detaches it from the unit, so those codes
      // are only findable through the unit's timeline.
      supabase
        .from("equipment_events")
        .select("*")
        .eq("equipment_id", equipment.id)
        .in("kind", CODE_HISTORY_EVENT_KINDS)
        .returns<EquipmentEvent[]>(),
      getEntitlements(),
      supabase.rpc("get_equipment_scan_stats", { p_equipment_id: equipment.id }),
    ]);

  const batchQrEnabled = FEATURES.batchQr && hasFeature(entitlements, "batchQr");
  const codes = linkedCodes ?? [];
  const activeCode = codes.find((code) => code.status === "active") ?? null;

  const detachedIds = (historyEvents ?? [])
    .map((event) => event.details?.qr_code_id)
    .filter((id): id is string => typeof id === "string" && !codes.some((code) => code.id === id));

  const { data: detachedCodes } = detachedIds.length
    ? await supabase.from("qr_codes").select("*").in("id", detachedIds).returns<QrCode[]>()
    : { data: [] as QrCode[] };

  const previousCodes: PreviousCode[] = [...codes, ...(detachedCodes ?? [])]
    .filter((code) => code.id !== activeCode?.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((code) => ({
      id: code.id,
      // Formatted here so the client bundle never has to import @/lib/qr,
      // which drags the `qrcode` renderer along with it.
      shortCode: formatShortCode(code.short_code),
      state: previousCodeState(code, equipment.id),
    }));

  if (!activeCode) {
    return (
      <div className="space-y-3 lg:w-80">
        <AssignCodeForm
          equipmentId={equipment.id}
          companyId={equipment.company_id}
          batchQrEnabled={batchQrEnabled}
        />
        {previousCodes.length > 0 && (
          <p className="px-1 text-xs text-muted-foreground">
            {previousCodes.length} previous code{previousCodes.length === 1 ? "" : "s"} for this
            unit {previousCodes.length === 1 ? "is" : "are"} no longer active. Scanning one of those
            stickers tells the customer to contact you.
          </p>
        )}
      </div>
    );
  }

  // Units that can receive this code. The DB allows one ACTIVE code per unit,
  // so anything that already has one would be rejected by reassign_qr_code().
  const { data: candidates } = await supabase
    .from("equipment")
    .select("id, name, qr_codes(id, status)")
    .neq("id", equipment.id)
    .order("name")
    .returns<{ id: string; name: string; qr_codes: { id: string; status: string }[] }[]>();

  const moveTargets = (candidates ?? [])
    .filter((row) => !row.qr_codes?.some((code) => code.status === "active"))
    .map((row) => ({ id: row.id, name: row.name }));

  const publicUrl = getEquipmentPublicUrl(activeCode.token);
  const qrDataUrl = await generateQrDataUrl(publicUrl);

  return (
    <QrCard
      qrDataUrl={qrDataUrl}
      publicUrl={publicUrl}
      equipmentId={equipment.id}
      codeId={activeCode.id}
      shortCode={formatShortCode(activeCode.short_code)}
      previousCodes={previousCodes}
      moveTargets={moveTargets}
      stats={(stats as EquipmentScanStats | null) ?? null}
    />
  );
}
