import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BackLink } from "@/components/back-link";
import type { EquipmentType, GuideOption, GuideStep } from "@/lib/types";
import { EditTypeForm } from "./edit-type-form";
import { GuideStepsEditor } from "./guide-steps-editor";
import { AiGuideDrafter } from "./ai-guide-drafter";

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
    .order("created_at")
    .returns<GuideStep[]>();

  const stepIds = (steps ?? []).map((s) => s.id);
  const { data: options } =
    stepIds.length === 0
      ? { data: [] as GuideOption[] }
      : await supabase
          .from("guide_options")
          .select("*")
          .in("guide_step_id", stepIds)
          .order("sort_order")
          .returns<GuideOption[]>();

  return (
    <div className="space-y-8">
      <div>
        <BackLink href="/dashboard/equipment-types" label="Back to equipment types" />
        <h1 className="text-2xl font-semibold">{type.name}</h1>
        <p className="text-muted-foreground">Equipment type details and troubleshooting guide.</p>
      </div>

      <EditTypeForm type={type} />

      <AiGuideDrafter
        equipmentTypeId={type.id}
        defaultDescription={type.description ?? ""}
        existingStepCount={steps?.length ?? 0}
      />

      <GuideStepsEditor equipmentTypeId={type.id} steps={steps ?? []} options={options ?? []} />
    </div>
  );
}
