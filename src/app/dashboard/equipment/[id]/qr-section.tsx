import { createClient } from "@/lib/supabase/server";
import { generateQrDataUrl, getEquipmentPublicUrl } from "@/lib/qr";
import { getEntitlements, hasFeature } from "@/lib/billing";
import { FEATURES } from "@/lib/features";
import type { Equipment, QrCode } from "@/lib/types";
import { QrCard } from "./qr-card";
import { AssignCodeForm } from "./assign-code-form";

/**
 * Self-contained server component for the QR side of the equipment page:
 * fetches the unit's active code + scan stats itself so the surrounding page
 * only has to render <QrSection equipment={...} />. The QR-hardening
 * workstream owns this file (and qr-card.tsx / assign-code-form.tsx); the
 * equipment-v2 workstream owns page.tsx.
 */
export async function QrSection({ equipment }: { equipment: Equipment }) {
  const supabase = await createClient();

  const [{ data: qrCode }, entitlements, { count: scanCount }] = await Promise.all([
    supabase
      .from("qr_codes")
      .select("*")
      .eq("equipment_id", equipment.id)
      .eq("status", "active")
      .maybeSingle<QrCode>(),
    getEntitlements(),
    supabase.from("scan_events").select("*", { count: "exact", head: true }).eq("equipment_id", equipment.id),
  ]);
  const batchQrEnabled = FEATURES.batchQr && hasFeature(entitlements, "batchQr");

  if (!qrCode) {
    return (
      <div className="lg:w-80">
        <AssignCodeForm equipmentId={equipment.id} companyId={equipment.company_id} batchQrEnabled={batchQrEnabled} />
      </div>
    );
  }

  const publicUrl = getEquipmentPublicUrl(qrCode.token);
  const qrDataUrl = await generateQrDataUrl(publicUrl);

  return (
    <QrCard
      qrDataUrl={qrDataUrl}
      publicUrl={publicUrl}
      equipmentId={equipment.id}
      fileName={equipment.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
      scanCount={scanCount ?? 0}
    />
  );
}
