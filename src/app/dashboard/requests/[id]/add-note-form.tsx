"use client";

import { forwardRef, useImperativeHandle, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { addRequestNote } from "../actions";

/** Imperative handle so a sibling "Reply to customer" button can drive this form without lifting its whole state up a level. */
export type AddNoteFormHandle = {
  /** Checks "visible to customer" and focuses the textarea, ready to type. */
  replyToCustomer: () => void;
};

export const AddNoteForm = forwardRef<AddNoteFormHandle, { requestId: string }>(function AddNoteForm(
  { requestId },
  ref
) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [visibleToCustomer, setVisibleToCustomer] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    replyToCustomer() {
      setVisibleToCustomer(true);
      textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      textareaRef.current?.focus();
    },
  }));

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
        ref={textareaRef}
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
});
