import { createClient } from "@/lib/supabase/server";
import { BackLink } from "@/components/back-link";
import { getEntitlements, hasFeature } from "@/lib/billing";
import { serverEnv } from "@/lib/env";
import type { EquipmentType } from "@/lib/types";
import { ChecklistEditor } from "../checklist-editor";

export default async function NewChecklistPage() {
  const supabase = await createClient();

  const [{ data: equipmentTypes }, entitlements] = await Promise.all([
    supabase.from("equipment_types").select("*").order("name").returns<EquipmentType[]>(),
    getEntitlements(),
  ]);

  const aiEnabled = !!serverEnv.ANTHROPIC_API_KEY && hasFeature(entitlements, "aiChat");

  return (
    <div className="space-y-6">
      <div>
        <BackLink href="/dashboard/checklists" label="Back to checklists" />
        <h1 className="text-2xl font-semibold">New checklist</h1>
        <p className="text-muted-foreground">
          Build an inspection template technicians can run from the equipment sticker.
        </p>
      </div>

      <ChecklistEditor
        template={null}
        equipmentTypes={equipmentTypes ?? []}
        aiEnabled={aiEnabled}
        canDelete={false}
      />
    </div>
  );
}
