import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BackLink } from "@/components/back-link";
import type { Customer, Equipment, EquipmentType } from "@/lib/types";
import { EditEquipmentForm } from "./edit-equipment-form";
import { QrSection } from "./qr-section";

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
        <QrSection equipment={equipment} />
      </div>
    </div>
  );
}
