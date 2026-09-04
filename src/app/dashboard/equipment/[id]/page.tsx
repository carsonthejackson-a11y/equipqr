import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generateQrDataUrl, getEquipmentPublicUrl } from "@/lib/qr";
import { BackLink } from "@/components/back-link";
import type { Customer, Equipment, EquipmentType, QrCode } from "@/lib/types";
import { getEntitlements, hasFeature } from "@/lib/billing";
import { FEATURES } from "@/lib/features";
import { EditEquipmentForm } from "./edit-equipment-form";
import { QrCard } from "./qr-card";
import { AssignCodeForm } from "./assign-code-form";

export default async function EquipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: equipment } = await supabase
    .from("equipment")
    .select("*")
    .eq("id", id)
    .maybeSingle<Equipment>();

  if (!equipment) {
    notFound();
  }

  const [{ data: equipmentTypes }, { data: customers }, { data: qrCode }, entitlements, { count: scanCount }] =
    await Promise.all([
      supabase.from("equipment_types").select("*").returns<EquipmentType[]>(),
      supabase.from("customers").select("*").order("name").returns<Customer[]>(),
      supabase.from("qr_codes").select("*").eq("equipment_id", id).maybeSingle<QrCode>(),
      getEntitlements(),
      supabase.from("scan_events").select("*", { count: "exact", head: true }).eq("equipment_id", id),
    ]);
  const batchQrEnabled = FEATURES.batchQr && hasFeature(entitlements, "batchQr");

  const publicUrl = qrCode ? getEquipmentPublicUrl(qrCode.token) : null;
  const qrDataUrl = publicUrl ? await generateQrDataUrl(publicUrl) : null;

  return (
    <div className="space-y-6">
      <div>
        <BackLink href="/dashboard/equipment" label="Back to equipment" />
        <h1 className="text-2xl font-semibold">{equipment.name}</h1>
        <p className="text-muted-foreground">Equipment details and QR code.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
        <EditEquipmentForm
          equipment={equipment}
          equipmentTypes={equipmentTypes ?? []}
          customers={customers ?? []}
        />
        {qrDataUrl && publicUrl ? (
          <QrCard
            qrDataUrl={qrDataUrl}
            publicUrl={publicUrl}
            equipmentId={equipment.id}
            fileName={equipment.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
            scanCount={scanCount ?? 0}
          />
        ) : (
          <div className="lg:w-80">
            <AssignCodeForm
              equipmentId={equipment.id}
              companyId={equipment.company_id}
              batchQrEnabled={batchQrEnabled}
            />
          </div>
        )}
      </div>
    </div>
  );
}
