"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/auth";
import {
  MAX_CUSTOM_FIELDS,
  MAX_FIELD_HELP_TEXT_LENGTH,
  MAX_FIELD_LABEL_LENGTH,
  MAX_FIELD_OPTIONS,
  MAX_FIELD_TEXT_LENGTH,
  isCustomFieldType,
  isValidFieldKey,
  parseOptions,
  slugifyFieldKey,
} from "@/lib/custom-fields";
import type { CustomFieldType, Equipment, EquipmentCustomField } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Rows one delete will scrub. A company past this many units with a value keeps the stale key — the app ignores it. */
const STRIP_BATCH_LIMIT = 500;

function revalidate() {
  revalidatePath("/dashboard/settings/custom-fields");
  revalidatePath("/dashboard/equipment");
  // A dynamic route needs the "page" type or revalidatePath is a no-op.
  revalidatePath("/dashboard/equipment/[id]", "page");
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

type DefinitionInput = {
  label: string;
  field_type: CustomFieldType;
  options: string[];
  help_text: string | null;
  show_on_scan_page: boolean;
};

/** Everything but the key: shared by create and update. Returns words a person can act on. */
function definitionFromForm(formData: FormData): { input: DefinitionInput } | { error: string } {
  const label = text(formData, "label");
  if (!label) return { error: "Give the field a label." };
  if (label.length > MAX_FIELD_LABEL_LENGTH) {
    return { error: `Labels are limited to ${MAX_FIELD_LABEL_LENGTH} characters.` };
  }

  const rawType = text(formData, "fieldType");
  if (!isCustomFieldType(rawType)) return { error: "Pick a field type." };

  const options = rawType === "select" ? parseOptions(String(formData.get("options") ?? "")) : [];
  if (rawType === "select") {
    if (options.length === 0) return { error: "A dropdown needs at least one option (one per line)." };
    if (options.length > MAX_FIELD_OPTIONS) {
      return { error: `Dropdowns are limited to ${MAX_FIELD_OPTIONS} options.` };
    }
    if (options.some((o) => o.length > MAX_FIELD_TEXT_LENGTH)) {
      return { error: `Each option must be ${MAX_FIELD_TEXT_LENGTH} characters or fewer.` };
    }
  }

  const helpText = text(formData, "helpText") || null;
  if (helpText && helpText.length > MAX_FIELD_HELP_TEXT_LENGTH) {
    return { error: `Help text is limited to ${MAX_FIELD_HELP_TEXT_LENGTH} characters.` };
  }

  // Checkboxes only appear in FormData when checked (the dialog also sets
  // "on"/"off" explicitly from state — either way, anything but on/true is off).
  const scan = text(formData, "showOnScanPage");
  const showOnScanPage = scan === "on" || scan === "true";

  return {
    input: { label, field_type: rawType, options, help_text: helpText, show_on_scan_page: showOnScanPage },
  };
}

async function loadDefinitions(supabase: Supabase, companyId: string): Promise<EquipmentCustomField[]> {
  const { data } = await supabase
    .from("equipment_custom_fields")
    .select("*")
    .eq("company_id", companyId)
    .order("sort_order")
    .order("created_at")
    .returns<EquipmentCustomField[]>();
  return data ?? [];
}

export async function createCustomField(formData: FormData) {
  const owner = await requireOwner();
  if (!owner) {
    return { error: "Only company owners can manage custom fields." };
  }

  const parsed = definitionFromForm(formData);
  if ("error" in parsed) return { error: parsed.error };
  const { input } = parsed;

  // The key is the jsonb key on every unit forever, so it is chosen once:
  // derived from the label unless the owner typed their own.
  const key = text(formData, "key").toLowerCase() || slugifyFieldKey(input.label);
  if (!isValidFieldKey(key)) {
    return {
      error:
        "Keys must start with a letter and use only lowercase letters, digits and underscores (up to 40 characters).",
    };
  }

  const supabase = await createClient();
  const existing = await loadDefinitions(supabase, owner.company.id);

  if (existing.length >= MAX_CUSTOM_FIELDS) {
    return { error: `You can define up to ${MAX_CUSTOM_FIELDS} custom fields. Delete one to add another.` };
  }
  if (existing.some((def) => def.key === key)) {
    return { error: `A field with the key "${key}" already exists. Choose a different key.` };
  }

  const nextSortOrder = existing.reduce((max, def) => Math.max(max, def.sort_order), -1) + 1;

  const { error } = await supabase.from("equipment_custom_fields").insert({
    company_id: owner.company.id,
    key,
    ...input,
    sort_order: nextSortOrder,
    created_by: owner.profile.id,
  });

  if (error) {
    // The unique (company_id, key) index is the backstop for a race between two tabs.
    if (error.code === "23505") {
      return { error: `A field with the key "${key}" already exists. Choose a different key.` };
    }
    return { error: error.message };
  }

  revalidate();
  return { success: true, key };
}

/** Everything but the key, which is immutable — it is the jsonb key on every row. */
export async function updateCustomField(id: string, formData: FormData) {
  const owner = await requireOwner();
  if (!owner) {
    return { error: "Only company owners can manage custom fields." };
  }

  const parsed = definitionFromForm(formData);
  if ("error" in parsed) return { error: parsed.error };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("equipment_custom_fields")
    .select("id")
    .eq("id", id)
    .eq("company_id", owner.company.id)
    .maybeSingle<{ id: string }>();
  if (!existing) {
    return { error: "That field no longer exists." };
  }

  const { error } = await supabase
    .from("equipment_custom_fields")
    .update(parsed.input)
    .eq("id", id)
    .eq("company_id", owner.company.id);

  if (error) {
    return { error: error.message };
  }

  revalidate();
  return { success: true };
}

/**
 * Removes a definition and scrubs its key from every unit that has a value,
 * so a later definition reusing the key doesn't inherit ghosts and the CSV
 * export / API stop carrying a column nobody can see. Scrubbing is per-row
 * (jsonb `-` isn't expressible through PostgREST) and capped at
 * STRIP_BATCH_LIMIT rows; a stale key on a row past the cap is harmless —
 * every reader goes through the definitions list.
 */
export async function deleteCustomField(id: string) {
  const owner = await requireOwner();
  if (!owner) {
    return { error: "Only company owners can manage custom fields." };
  }

  const supabase = await createClient();
  const { data: def } = await supabase
    .from("equipment_custom_fields")
    .select("id, key, label")
    .eq("id", id)
    .eq("company_id", owner.company.id)
    .maybeSingle<Pick<EquipmentCustomField, "id" | "key" | "label">>();
  if (!def) {
    return { error: "That field no longer exists." };
  }

  const { error } = await supabase
    .from("equipment_custom_fields")
    .delete()
    .eq("id", id)
    .eq("company_id", owner.company.id);
  if (error) {
    return { error: error.message };
  }

  // `custom_fields->>key is not null` finds rows where the key holds a
  // non-null value; a key explicitly set to JSON null is already invisible.
  const { data: rows } = await supabase
    .from("equipment")
    .select("id, custom_fields")
    .eq("company_id", owner.company.id)
    .not(`custom_fields->>${def.key}`, "is", null)
    .limit(STRIP_BATCH_LIMIT)
    .returns<Pick<Equipment, "id" | "custom_fields">[]>();

  for (const row of rows ?? []) {
    const { [def.key]: _removed, ...rest } = row.custom_fields ?? {};
    void _removed;
    await supabase.from("equipment").update({ custom_fields: rest }).eq("id", row.id);
  }

  revalidate();
  return { success: true };
}

/** Swaps sort_order with the neighbour above or below. No-op at either end. */
export async function moveCustomField(id: string, direction: "up" | "down") {
  const owner = await requireOwner();
  if (!owner) {
    return { error: "Only company owners can manage custom fields." };
  }
  if (direction !== "up" && direction !== "down") {
    return { error: "Unknown direction." };
  }

  const supabase = await createClient();
  const defs = await loadDefinitions(supabase, owner.company.id);
  const index = defs.findIndex((def) => def.id === id);
  if (index === -1) {
    return { error: "That field no longer exists." };
  }

  const otherIndex = direction === "up" ? index - 1 : index + 1;
  if (otherIndex < 0 || otherIndex >= defs.length) {
    return { success: true };
  }

  // Renumber the whole list from the swapped order: definitions created
  // before ordering existed all share sort_order 0, so a plain swap of two
  // equal numbers would move nothing.
  const reordered = [...defs];
  [reordered[index], reordered[otherIndex]] = [reordered[otherIndex], reordered[index]];

  for (let position = 0; position < reordered.length; position++) {
    const def = reordered[position];
    if (def.sort_order === position) continue;
    const { error } = await supabase
      .from("equipment_custom_fields")
      .update({ sort_order: position })
      .eq("id", def.id)
      .eq("company_id", owner.company.id);
    if (error) {
      return { error: error.message };
    }
  }

  revalidate();
  return { success: true };
}
