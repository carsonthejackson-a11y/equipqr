"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import type { ServiceRequest } from "@/lib/types";
import { closeServiceRequest } from "../actions";

// ---- Next roadmap (migration 0019 / workstream A) ----
// A request closed out from the phone (`/e/[qrToken]/staff`) may already
// carry technician photos and a customer signature by the time someone
// opens "Edit close-out" here — shown read-only so reopening the dialog
// doesn't look like it lost them. This dialog itself still only edits the
// summary/recommendations/email fields; photos and signatures are
// phone-only (see close-out-dialog.tsx).
export type CloseRequestExistingMedia = {
  staffPhotos: { url: string; caption: string | null }[];
  signature: { url: string; signedByName: string | null; signedAt: string | null } | null;
};

export function CloseRequestDialog({
  request,
  existingMedia,
}: {
  request: ServiceRequest;
  existingMedia?: CloseRequestExistingMedia;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sendEmail, setSendEmail] = useState(!!request.contact_email);

  const alreadyClosed = request.status === "resolved";

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setError(null);
    const result = await closeServiceRequest(request.id, formData);
    setSubmitting(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    if (result.emailAttempted && !result.emailSent) {
      toast.warning("Closed, but the email couldn't be sent — check Resend is configured.");
    } else if (result.emailSent) {
      toast.success("Closed and emailed the customer");
    } else {
      toast.success("Closed");
    }

    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant={alreadyClosed ? "outline" : "default"}>
          {alreadyClosed ? "Edit close-out" : "Close out request"}
        </Button>}
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close out request</DialogTitle>
          <DialogDescription>
            Record what was done and optionally email a summary to the customer.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {existingMedia && (existingMedia.staffPhotos.length > 0 || existingMedia.signature) && (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Captured from the phone
              </p>
              {existingMedia.staffPhotos.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {existingMedia.staffPhotos.map((photo, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={photo.url}
                      alt={photo.caption ?? "Technician photo"}
                      className="aspect-square w-full rounded-md border object-cover"
                    />
                  ))}
                </div>
              )}
              {existingMedia.signature && (
                <p className="text-muted-foreground">
                  Signed by {existingMedia.signature.signedByName ?? "the customer"}
                  {existingMedia.signature.signedAt
                    ? ` on ${new Date(existingMedia.signature.signedAt).toLocaleDateString()}`
                    : ""}
                </p>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="summary">Summary of work performed</Label>
            <Textarea
              id="summary"
              name="summary"
              rows={4}
              defaultValue={request.resolution_summary ?? ""}
              placeholder="What did you do to fix this?"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="recommendations">Future recommendations (optional)</Label>
            <Textarea
              id="recommendations"
              name="recommendations"
              rows={3}
              defaultValue={request.resolution_recommendations ?? ""}
              placeholder="Anything the customer should keep an eye on or plan for?"
            />
          </div>
          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="sendEmail"
                name="sendEmail"
                checked={sendEmail}
                onCheckedChange={(checked) => setSendEmail(checked === true)}
              />
              <Label htmlFor="sendEmail" className="font-normal">
                Email this summary to the customer
              </Label>
            </div>
            {sendEmail && (
              <div className="space-y-2">
                <Label htmlFor="emailTo">Send to</Label>
                <Input
                  id="emailTo"
                  name="emailTo"
                  type="email"
                  defaultValue={request.contact_email ?? ""}
                  placeholder="customer@example.com"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : "Close request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
