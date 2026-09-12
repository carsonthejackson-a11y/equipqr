"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Vendor } from "@/lib/types";
import { deactivateVendor, deleteVendor, updateVendor } from "../actions";

export function EditVendorForm({ vendor, canDelete }: { vendor: Vendor; canDelete: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);

  async function handleSave(formData: FormData) {
    setError(null);
    const result = await updateVendor(vendor.id, formData);
    if (result?.error) {
      setError(result.error);
      return;
    }
    toast.success("Saved");
    router.refresh();
  }

  async function handleToggleActive() {
    setTogglingActive(true);
    const result = await deactivateVendor(vendor.id, !vendor.active);
    setTogglingActive(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    toast.success(vendor.active ? "Vendor deactivated" : "Vendor reactivated");
    router.refresh();
  }

  async function handleDelete() {
    if (!confirm("Delete this vendor? Equipment assigned to it will be kept but unlinked.")) return;
    setDeleting(true);
    const result = await deleteVendor(vendor.id);
    setDeleting(false);
    if (result?.error) {
      toast.error(result.error);
      setDeleting(false);
      return;
    }
    router.push("/dashboard/vendors");
  }

  return (
    <form action={handleSave} className="max-w-lg space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={vendor.name} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" defaultValue={vendor.email ?? ""} />
        <p className="text-sm text-muted-foreground">
          Work orders are emailed here. Leave blank if this vendor has no email.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" type="tel" defaultValue={vendor.phone ?? ""} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="categories">Categories</Label>
        <Input id="categories" name="categories" defaultValue={vendor.categories.join(", ")} />
        <p className="text-sm text-muted-foreground">Comma-separated.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="hours">Hours</Label>
        <Input id="hours" name="hours" defaultValue={vendor.hours ?? ""} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="accountNumber">Account number</Label>
        <Input id="accountNumber" name="accountNumber" defaultValue={vendor.account_number ?? ""} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ackSlaMinutes">Expected response time (minutes)</Label>
        <Input
          id="ackSlaMinutes"
          name="ackSlaMinutes"
          type="number"
          min={15}
          max={10080}
          defaultValue={vendor.ack_sla_minutes}
        />
        <p className="text-sm text-muted-foreground">
          You&apos;ll get a reminder email if this vendor hasn&apos;t responded by then.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={3} defaultValue={vendor.notes ?? ""} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit">Save</Button>
        <Button type="button" variant="outline" onClick={handleToggleActive} disabled={togglingActive}>
          {togglingActive ? "Saving..." : vendor.active ? "Deactivate" : "Reactivate"}
        </Button>
        {canDelete && (
          <Button
            type="button"
            variant="outline"
            onClick={handleDelete}
            disabled={deleting}
            title="Vendors with dispatch history can only be deactivated"
          >
            {deleting ? "Deleting..." : "Delete vendor"}
          </Button>
        )}
      </div>
    </form>
  );
}
