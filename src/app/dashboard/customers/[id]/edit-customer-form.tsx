"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Customer } from "@/lib/types";
import { deleteCustomer, updateCustomer } from "../actions";

export function EditCustomerForm({ customer }: { customer: Customer }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleSave(formData: FormData) {
    setError(null);
    const result = await updateCustomer(customer.id, formData);
    if (result?.error) {
      setError(result.error);
      return;
    }
    toast.success("Saved");
    // updateCustomer() already revalidatePath()s this route, so the
    // read-only header above (page.tsx) picks up the new values as soon as
    // this collapses back — no router.refresh() needed here.
    setEditing(false);
  }

  async function handleDelete() {
    if (
      !confirm(
        "Delete this customer? Equipment linked to it will be kept but unlinked."
      )
    ) {
      return;
    }
    setDeleting(true);
    const result = await deleteCustomer(customer.id);
    setDeleting(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    router.push("/dashboard/customers");
  }

  if (!editing) {
    return (
      <Button type="button" variant="outline" onClick={() => setEditing(true)}>
        Edit details
      </Button>
    );
  }

  return (
    <form action={handleSave} className="max-w-lg space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={customer.name} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="address">Address</Label>
        <Textarea id="address" name="address" rows={2} defaultValue={customer.address ?? ""} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="contactName">Contact name</Label>
        <Input id="contactName" name="contactName" defaultValue={customer.contact_name ?? ""} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="contactEmail">Contact email</Label>
        <Input
          id="contactEmail"
          name="contactEmail"
          type="email"
          defaultValue={customer.contact_email ?? ""}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="contactPhone">Contact phone</Label>
        <Input
          id="contactPhone"
          name="contactPhone"
          type="tel"
          defaultValue={customer.contact_phone ?? ""}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit">Save</Button>
        <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
        <Button type="button" variant="outline" className="ml-auto" onClick={handleDelete} disabled={deleting}>
          {deleting ? "Deleting..." : "Delete customer"}
        </Button>
      </div>
    </form>
  );
}
