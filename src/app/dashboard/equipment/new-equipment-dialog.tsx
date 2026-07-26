"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
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
import type { EquipmentType } from "@/lib/types";
import { createEquipment } from "./actions";

export function NewEquipmentDialog({ equipmentTypes }: { equipmentTypes: EquipmentType[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setError(null);
    const result = await createEquipment(formData);
    setSubmitting(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    setOpen(false);
    if (result?.id) {
      router.push(`/dashboard/equipment/${result.id}`);
    }
  }

  const noTypes = equipmentTypes.length === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button disabled={noTypes} title={noTypes ? "Create an equipment type first" : undefined}>
            New equipment
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New equipment</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="space-y-2">
            <Label htmlFor="name">Name / label</Label>
            <Input id="name" name="name" placeholder="e.g. Break room water heater" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="equipmentTypeId">Equipment type</Label>
            <Select
              name="equipmentTypeId"
              items={Object.fromEntries(equipmentTypes.map((type) => [type.id, type.name]))}
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
            <Label htmlFor="serialNumber">Serial number (optional)</Label>
            <Input id="serialNumber" name="serialNumber" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="location">Location (optional)</Label>
            <Input id="location" name="location" placeholder="e.g. Building A, Floor 2" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
