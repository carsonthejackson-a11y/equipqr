import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { EquipmentType, GuideStep } from "@/lib/types";
import { EditTypeForm } from "./edit-type-form";
import { GuideStepsEditor } from "./guide-steps-editor";

export default async function EquipmentTypeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: type } = await supabase
    .from("equipment_types")
    .select("*")
    .eq("id", id)
    .maybeSingle<EquipmentType>();

  if (!type) {
    notFound();
  }

  const { data: steps } = await supabase
    .from("guide_steps")
    .select("*")
    .eq("equipment_type_id", id)
    .order("step_number")
    .returns<GuideStep[]>();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">{type.name}</h1>
        <p className="text-muted-foreground">Equipment type details and troubleshooting guide.</p>
      </div>

      <EditTypeForm type={type} />

      <GuideStepsEditor equipmentTypeId={type.id} steps={steps ?? []} />
    </div>
  );
}
