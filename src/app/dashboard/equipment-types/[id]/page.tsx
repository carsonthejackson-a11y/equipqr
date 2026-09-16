import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BackLink } from "@/components/back-link";
import { Button } from "@/components/ui/button";
import { getCurrentProfile } from "@/lib/auth";
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

  const [{ data: type }, { profile, company }] = await Promise.all([
    supabase.from("equipment_types").select("*").eq("id", id).maybeSingle<EquipmentType>(),
    getCurrentProfile(),
  ]);

  if (!type) {
    notFound();
  }

  const isOwner = profile.role === "owner";

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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{type.name}</h1>
            <p className="text-muted-foreground">Equipment type details and troubleshooting guide.</p>
          </div>
          {/* Lands right here after creating a type, so this is also the "now
              go add your first unit of it" prompt (docs/QOL-CONTINUITY-BRIEF.md
              item 10 / Q-23). The equipment page's NewEquipmentDialog already
              reads ?type= to preselect this type (item 1's combobox). */}
          <Button
            render={<Link href={`/dashboard/equipment?new=1&type=${type.id}`} />}
            nativeButton={false}
            variant="outline"
          >
            Add a unit of this type
          </Button>
        </div>
      </div>

      <EditTypeForm type={type} kind={company.kind} isOwner={isOwner} />

      <AiGuideDrafter
        equipmentTypeId={type.id}
        defaultDescription={type.description ?? ""}
        existingStepCount={steps?.length ?? 0}
      />

      <GuideStepsEditor
        equipmentTypeId={type.id}
        steps={steps ?? []}
        options={options ?? []}
        isOwner={isOwner}
      />
    </div>
  );
}
