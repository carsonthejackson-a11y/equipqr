"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Location } from "@/lib/types";
import { deactivateLocation, deleteLocation, updateLocation } from "../actions";

export function EditLocationForm({ location, canDelete }: { location: Location; canDelete: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);

  async function handleSave(formData: FormData) {
    setError(null);
    const result = await updateLocation(location.id, formData);
    if (result?.error) {
      setError(result.error);
      return;
    }
    toast.success("Saved");
    router.refresh();
  }

  async function handleToggleActive() {
    setTogglingActive(true);
    const result = await deactivateLocation(location.id, !location.active);
    setTogglingActive(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    toast.success(location.active ? "Location deactivated" : "Location reactivated");
    router.refresh();
  }

  async function handleDelete() {
    if (
      !confirm(
        "Delete this location? Equipment assigned to it will be kept but unlinked from this location."
      )
    ) {
      return;
    }
    setDeleting(true);
    const result = await deleteLocation(location.id);
    setDeleting(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    router.push("/dashboard/locations");
  }

  return (
    <form action={handleSave} className="max-w-lg space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={location.name} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="address">Address</Label>
        <Textarea id="address" name="address" rows={2} defaultValue={location.address ?? ""} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" type="tel" defaultValue={location.phone ?? ""} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="hours">Hours</Label>
        <Input id="hours" name="hours" defaultValue={location.hours ?? ""} placeholder="e.g. Mon–Sun 7am–10pm" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={location.notes ?? ""}
          placeholder="Internal only — staff never see this."
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit">Save</Button>
        <Button type="button" variant="outline" onClick={handleToggleActive} disabled={togglingActive}>
          {togglingActive ? "Saving..." : location.active ? "Deactivate" : "Reactivate"}
        </Button>
        {canDelete && (
          <Button type="button" variant="outline" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Deleting..." : "Delete location"}
          </Button>
        )}
      </div>
    </form>
  );
}
