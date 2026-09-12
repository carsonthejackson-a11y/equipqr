"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { EquipmentType } from "@/lib/types";
import { clearCategoryDefault, setCategoryDefault } from "../actions";

/**
 * Per-equipment-type "default vendor for this category" toggles
 * (docs/OWNER-ROADMAP-BRIEF.md §3.2). Checking a type makes this vendor the
 * fallback submit_owner_service_request() dispatches to when a unit of that
 * type has no vendor of its own (§2.2.3's `'category'` precedence step).
 * Unchecking one that currently points at a *different* vendor reassigns it
 * to this one — a category has at most one default at a time.
 */
export function CategoryDefaultsEditor({
  vendorId,
  equipmentTypes,
  defaultTypeIds,
}: {
  vendorId: string;
  equipmentTypes: EquipmentType[];
  /** Equipment type ids whose current category_default_vendors row already points at this vendor. */
  defaultTypeIds: string[];
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(new Set(defaultTypeIds));
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleToggle(typeId: string, next: boolean) {
    setPendingId(typeId);
    startTransition(async () => {
      const result = next ? await setCategoryDefault(typeId, vendorId) : await clearCategoryDefault(typeId);
      setPendingId(null);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      setChecked((prev) => {
        const nextSet = new Set(prev);
        if (next) nextSet.add(typeId);
        else nextSet.delete(typeId);
        return nextSet;
      });
      router.refresh();
    });
  }

  if (equipmentTypes.length === 0) {
    return <p className="text-sm text-muted-foreground">Create an equipment type first.</p>;
  }

  return (
    <ul className="space-y-2">
      {equipmentTypes.map((type) => (
        <li key={type.id} className="flex items-center gap-2">
          <Checkbox
            id={`category-default-${type.id}`}
            checked={checked.has(type.id)}
            disabled={pendingId === type.id}
            onCheckedChange={(value) => handleToggle(type.id, value === true)}
          />
          <Label htmlFor={`category-default-${type.id}`} className="font-normal">
            {type.name}
          </Label>
        </li>
      ))}
    </ul>
  );
}
