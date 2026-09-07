import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BackLink } from "@/components/back-link";
import { getCurrentProfile } from "@/lib/auth";
import { getEntitlements, hasFeature } from "@/lib/billing";
import { serverEnv } from "@/lib/env";
import type { ChecklistTemplate, EquipmentType } from "@/lib/types";
import { ChecklistEditor } from "../checklist-editor";

export default async function ChecklistDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: template } = await supabase
    .from("checklist_templates")
    .select("*")
    .eq("id", id)
    .maybeSingle<ChecklistTemplate>();

  if (!template) {
    notFound();
  }

  const [{ data: equipmentTypes }, entitlements, { profile }] = await Promise.all([
    supabase.from("equipment_types").select("*").order("name").returns<EquipmentType[]>(),
    getEntitlements(),
    getCurrentProfile(),
  ]);

  const aiEnabled = !!serverEnv.ANTHROPIC_API_KEY && hasFeature(entitlements, "aiChat");

  return (
    <div className="space-y-6">
      <div>
        <BackLink href="/dashboard/checklists" label="Back to checklists" />
        <h1 className="text-2xl font-semibold">{template.name}</h1>
        <p className="text-muted-foreground">Edit this inspection checklist.</p>
      </div>

      <ChecklistEditor
        template={template}
        equipmentTypes={equipmentTypes ?? []}
        aiEnabled={aiEnabled}
        canDelete={profile.role === "owner"}
      />
    </div>
  );
}
