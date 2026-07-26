"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { EquipmentType } from "@/lib/types";
import { deleteEquipmentType, updateEquipmentType } from "../actions";

export function EditTypeForm({ type }: { type: EquipmentType }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleSave(formData: FormData) {
    setError(null);
    const result = await updateEquipmentType(type.id, formData);
    if (result?.error) {
      setError(result.error);
      return;
    }
    toast.success("Saved");
  }

  async function handleDelete() {
    if (
      !confirm(
        "Delete this equipment type? This is only possible if no equipment is using it."
      )
    ) {
      return;
    }
    setDeleting(true);
    const result = await deleteEquipmentType(type.id);
    setDeleting(false);
    if (result?.error) {
      setError(
        "Couldn't delete — this type is probably still assigned to equipment. Reassign or delete that equipment first."
      );
      return;
    }
    router.push("/dashboard/equipment-types");
  }

  return (
    <form action={handleSave} className="max-w-lg space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={type.name} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" rows={3} defaultValue={type.description ?? ""} />
      </div>
      <div className="flex gap-2">
        <Button type="submit">Save</Button>
        <Button type="button" variant="outline" onClick={handleDelete} disabled={deleting}>
          {deleting ? "Deleting..." : "Delete type"}
        </Button>
      </div>
    </form>
  );
}
