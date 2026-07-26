"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Equipment, EquipmentType } from "@/lib/types";
import { deleteEquipment, updateEquipment } from "../actions";

export function EditEquipmentForm({
  equipment,
  equipmentTypes,
}: {
  equipment: Equipment;
  equipmentTypes: EquipmentType[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleSave(formData: FormData) {
    setError(null);
    const result = await updateEquipment(equipment.id, formData);
    if (result?.error) {
      setError(result.error);
      return;
    }
    toast.success("Saved");
  }

  async function handleDelete() {
    if (!confirm("Delete this equipment? Its QR code will stop working.")) return;
    setDeleting(true);
    const result = await deleteEquipment(equipment.id);
    setDeleting(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    router.push("/dashboard/equipment");
  }

  return (
    <form action={handleSave} className="max-w-lg space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="space-y-2">
        <Label htmlFor="name">Name / label</Label>
        <Input id="name" name="name" defaultValue={equipment.name} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="equipmentTypeId">Equipment type</Label>
        <Select
          name="equipmentTypeId"
          items={Object.fromEntries(equipmentTypes.map((type) => [type.id, type.name]))}
          defaultValue={equipment.equipment_type_id}
          required
        >
          <SelectTrigger id="equipmentTypeId" className="w-full">
            <SelectValue placeholder="Select a type" />
          </SelectTrigger>
          <SelectContent>
            {equipmentTypes.map((type) => (
              <SelectItem key={type.id} value={type.id}>
                {type.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="serialNumber">Serial number</Label>
        <Input id="serialNumber" name="serialNumber" defaultValue={equipment.serial_number ?? ""} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="location">Location</Label>
        <Input id="location" name="location" defaultValue={equipment.location ?? ""} />
      </div>
      <div className="flex gap-2">
        <Button type="submit">Save</Button>
        <Button type="button" variant="outline" onClick={handleDelete} disabled={deleting}>
          {deleting ? "Deleting..." : "Delete equipment"}
        </Button>
      </div>
    </form>
  );
}
