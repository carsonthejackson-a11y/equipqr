import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generateQrDataUrl, getEquipmentPublicUrl } from "@/lib/qr";
import { BackLink } from "@/components/back-link";
import type { Customer, Equipment, EquipmentType } from "@/lib/types";
import { EditEquipmentForm } from "./edit-equipment-form";
import { QrCard } from "./qr-card";

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

  const [{ data: equipmentTypes }, { data: customers }] = await Promise.all([
    supabase.from("equipment_types").select("*").returns<EquipmentType[]>(),
    supabase.from("customers").select("*").order("name").returns<Customer[]>(),
  ]);

  const publicUrl = getEquipmentPublicUrl(equipment.qr_token);
  const qrDataUrl = await generateQrDataUrl(publicUrl);

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
        <QrCard
          qrDataUrl={qrDataUrl}
          publicUrl={publicUrl}
          equipmentId={equipment.id}
          fileName={equipment.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
        />
      </div>
    </div>
  );
}
