"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generateBatch } from "./actions";

export function GenerateBatchForm({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    const result = await generateBatch(companyId, formData);
    setSubmitting(false);

    if (result?.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Batch generated");
    router.refresh();
  }

  return (
    <form action={handleSubmit} className="flex items-end gap-2">
      <div className="space-y-2">
        <Label htmlFor="count">New batch size</Label>
        <Input id="count" name="count" type="number" min={1} max={500} defaultValue={50} className="w-28" />
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? "Generating..." : "Generate batch"}
      </Button>
    </form>
  );
}
