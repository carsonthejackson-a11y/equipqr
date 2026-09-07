import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { OwnerOnlyCard } from "@/components/owner-only-card";
import { MAX_CUSTOM_FIELDS } from "@/lib/custom-fields";
import type { EquipmentCustomField } from "@/lib/types";
import { SettingsSubnav } from "../settings-subnav";
import { CustomFieldsTable } from "./custom-fields-table";

export const metadata = {
  title: "Custom fields",
};

export default async function CustomFieldsSettingsPage() {
  const ctx = await requireOwner();

  // RLS scopes this to the caller's company for owners and technicians
  // alike; technicians get the list read-only, since it shapes the
  // equipment form they fill in.
  const supabase = await createClient();
  const { data } = await supabase
    .from("equipment_custom_fields")
    .select("*")
    .order("sort_order")
    .order("created_at")
    .returns<EquipmentCustomField[]>();
  const fields: EquipmentCustomField[] = data ?? [];

  return (
    <div className="space-y-6">
      <SettingsSubnav />
      <div>
        <h1 className="text-2xl font-semibold">Custom fields</h1>
        <p className="text-muted-foreground">
          Extra fields on every equipment record — asset tags, filter sizes, refrigerant type,
          whatever your techs need to see. Up to {MAX_CUSTOM_FIELDS} per company.
        </p>
      </div>

      {!ctx && (
        <OwnerOnlyCard message="Only company owners can define custom fields. You can still fill them in on each unit." />
      )}
      <CustomFieldsTable fields={fields} maxFields={MAX_CUSTOM_FIELDS} readOnly={!ctx} />
    </div>
  );
}
