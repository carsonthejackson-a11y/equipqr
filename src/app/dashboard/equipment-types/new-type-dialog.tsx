"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { createEquipmentType } from "./actions";

export function NewEquipmentTypeDialog() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // ?new=1 opens the dialog straight up — the Overview checklist links here
  // instead of making its own copy of this form (docs/QOL-CONTINUITY-BRIEF.md
  // item 4). Read once via lazy init so there's no open-then-flash on mount.
  const [open, setOpen] = useState(() => searchParams.get("new") === "1");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    router.replace("/dashboard/equipment-types");
  }, [searchParams, router]);

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setError(null);
    const result = await createEquipmentType(formData);
    setSubmitting(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    setOpen(false);
    if (result?.id) {
      router.push(`/dashboard/equipment-types/${result.id}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>New equipment type</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New equipment type</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" placeholder="e.g. Model X Water Heater" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea id="description" name="description" rows={3} />
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
