"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { addRequestNote } from "../actions";

export function AddNoteForm({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [visibleToCustomer, setVisibleToCustomer] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;

    setSubmitting(true);
    setError(null);
    const result = await addRequestNote(requestId, trimmed, visibleToCustomer);
    setSubmitting(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    toast.success(visibleToCustomer ? "Note added and emailed to the customer" : "Note added");
    setBody("");
    setVisibleToCustomer(false);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border p-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Textarea
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add a note…"
      />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id="visibleToCustomer"
            checked={visibleToCustomer}
            onCheckedChange={(checked) => setVisibleToCustomer(checked === true)}
          />
          <Label htmlFor="visibleToCustomer" className="font-normal">
            Visible to customer{visibleToCustomer ? " — emails them too" : ""}
          </Label>
        </div>
        <Button type="submit" size="sm" disabled={submitting || !body.trim()}>
          {submitting ? "Saving…" : "Add note"}
        </Button>
      </div>
    </form>
  );
}
