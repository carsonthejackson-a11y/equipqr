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
import { Textarea } from "@/components/ui/textarea";
import { createVendor } from "./actions";

export function NewVendorDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setError(null);
    const result = await createVendor(formData);
    setSubmitting(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    setOpen(false);
    if (result?.id) {
      router.push(`/dashboard/vendors/${result.id}`);
    }
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>New vendor</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New vendor</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" placeholder="e.g. Metro Refrigeration" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" placeholder="dispatch@vendor.com" />
            <p className="text-sm text-muted-foreground">
              Work orders are emailed here. Leave blank if this vendor has no email — you&apos;ll
              be notified instead, with no dispatch sent.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" type="tel" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="categories">Categories (optional)</Label>
            <Input id="categories" name="categories" placeholder="Refrigeration, Ice machines" />
            <p className="text-sm text-muted-foreground">Comma-separated. Informational for now.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="hours">Hours (optional)</Label>
            <Input id="hours" name="hours" placeholder="e.g. 24/7 emergency line" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="accountNumber">Account number (optional)</Label>
            <Input id="accountNumber" name="accountNumber" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ackSlaMinutes">Expected response time (minutes)</Label>
            <Input id="ackSlaMinutes" name="ackSlaMinutes" type="number" min={15} max={10080} defaultValue={120} />
            <p className="text-sm text-muted-foreground">
              You&apos;ll get a reminder email if this vendor hasn&apos;t responded by then.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" name="notes" rows={3} />
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
