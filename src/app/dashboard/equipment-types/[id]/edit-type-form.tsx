"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { CompanyKind, EquipmentType } from "@/lib/types";
import { deleteEquipmentType, updateEquipmentType } from "../actions";

const MAX_CHIP_LENGTH = 40;

export function EditTypeForm({
  type,
  kind = "service_provider",
}: {
  type: EquipmentType;
  /** Symptom chips only mean anything on the owner-kind report form (docs/OWNER-ROADMAP-BRIEF.md §3.3.1). */
  kind?: CompanyKind;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [chips, setChips] = useState<string[]>(type.symptom_chips);
  const [chipInput, setChipInput] = useState("");

  function addChip() {
    const value = chipInput.trim();
    if (!value) return;
    if (value.length > MAX_CHIP_LENGTH) {
      toast.error(`Keep each chip under ${MAX_CHIP_LENGTH} characters.`);
      return;
    }
    if (chips.some((c) => c.toLowerCase() === value.toLowerCase())) {
      setChipInput("");
      return;
    }
    setChips((prev) => [...prev, value]);
    setChipInput("");
  }

  function removeChip(value: string) {
    setChips((prev) => prev.filter((c) => c !== value));
  }

  async function handleSave(formData: FormData) {
    setError(null);
    formData.set("symptomChips", JSON.stringify(chips));
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
      {kind === "equipment_owner" && (
        <div className="space-y-2">
          <Label htmlFor="symptomChipInput">Problem chips</Label>
          <p className="text-sm text-muted-foreground">
            Quick-pick buttons staff see on the scan report form for this equipment type.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <Badge key={chip} variant="secondary" className="gap-1 pr-1">
                {chip}
                <button
                  type="button"
                  onClick={() => removeChip(chip)}
                  className="rounded-full p-0.5 hover:bg-foreground/10"
                  aria-label={`Remove "${chip}"`}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
            {chips.length === 0 && <p className="text-sm text-muted-foreground">No chips yet.</p>}
          </div>
          <div className="flex gap-2">
            <Input
              id="symptomChipInput"
              value={chipInput}
              maxLength={MAX_CHIP_LENGTH}
              placeholder="e.g. Not cooling"
              onChange={(e) => setChipInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addChip();
                }
              }}
            />
            <Button type="button" variant="outline" onClick={addChip}>
              Add
            </Button>
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <Button type="submit">Save</Button>
        <Button type="button" variant="outline" onClick={handleDelete} disabled={deleting}>
          {deleting ? "Deleting..." : "Delete type"}
        </Button>
      </div>
    </form>
  );
}
