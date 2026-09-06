"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MAX_FIELD_TEXT_LENGTH, customFieldInputName } from "@/lib/custom-fields";
import type { EquipmentCustomField } from "@/lib/types";

/** The "not set" choice in a dropdown field. Submits "" which the parser reads as absent. */
const UNSET = "";

function stringValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

/**
 * Inputs for every company-defined field, named `cf_<key>` so the server
 * action can read them back with parseCustomFieldValues(). Uncontrolled —
 * the surrounding <form action> collects them like any other field. Renders
 * nothing when the company hasn't defined any fields.
 */
export function CustomFieldsInputs({
  definitions,
  values,
}: {
  definitions: EquipmentCustomField[];
  /** Current `equipment.custom_fields`; omit for a new unit. */
  values?: Record<string, unknown> | null;
}) {
  if (definitions.length === 0) return null;

  return (
    <div className="space-y-4">
      {definitions.map((def) => {
        const name = customFieldInputName(def.key);
        const id = `cf-${def.key}`;
        const current = values?.[def.key];

        if (def.field_type === "boolean") {
          return (
            <label key={def.id} className="group/field flex items-start gap-2.5" htmlFor={id}>
              <Checkbox
                id={id}
                name={name}
                value="true"
                uncheckedValue="false"
                defaultChecked={current === true || current === "true"}
                className="mt-0.5"
              />
              <span className="text-sm leading-tight">
                {def.label}
                {def.help_text && (
                  <span className="mt-0.5 block text-muted-foreground">{def.help_text}</span>
                )}
              </span>
            </label>
          );
        }

        return (
          <div key={def.id} className="space-y-2">
            <Label htmlFor={id}>{def.label}</Label>
            {def.field_type === "select" ? (
              <Select
                name={name}
                items={{ [UNSET]: "Not set", ...Object.fromEntries(def.options.map((o) => [o, o])) }}
                defaultValue={
                  typeof current === "string" && def.options.includes(current) ? current : UNSET
                }
              >
                <SelectTrigger id={id} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET}>Not set</SelectItem>
                  {def.options.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : def.field_type === "number" ? (
              <Input id={id} name={name} type="number" step="any" defaultValue={stringValue(current)} />
            ) : def.field_type === "date" ? (
              <Input id={id} name={name} type="date" defaultValue={stringValue(current).slice(0, 10)} />
            ) : (
              <Input
                id={id}
                name={name}
                maxLength={MAX_FIELD_TEXT_LENGTH}
                defaultValue={stringValue(current)}
              />
            )}
            {def.help_text && <p className="text-sm text-muted-foreground">{def.help_text}</p>}
          </div>
        );
      })}
    </div>
  );
}
