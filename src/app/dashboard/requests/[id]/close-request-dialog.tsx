"use client";

import { useEffect, useRef, useState } from "react";
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
import {
  clearCloseOutDraft,
  isCloseOutDirty,
  readCloseOutDraft,
  writeCloseOutDraft,
  type CloseOutFields,
} from "@/lib/close-out-draft";
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
  open: openProp,
  onOpenChange: onOpenChangeProp,
  triggerLabel,
  editTriggerLabel,
}: {
  request: ServiceRequest;
  existingMedia?: CloseRequestExistingMedia;
  /**
   * QoL-4/Q-14 (additive, controlled-component prop — internals below are
   * still QoL-2a's): lets a caller open this dialog itself, e.g.
   * request-header-actions.tsx opening it when "Resolved" is picked from
   * the status control, instead of the customer picking up a generic
   * "resolved" email with no summary. Omit both props for the original
   * self-contained trigger+dialog behaviour — this stays fully backward
   * compatible.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Overrides the trigger button's not-yet-closed label (default "Close out request") — e.g. owner-kind "Mark fixed" (C1-02/Q-60). */
  triggerLabel?: string;
  /** Overrides the trigger button's already-closed label (default "Edit close-out"). */
  editTriggerLabel?: string;
}) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = onOpenChangeProp ?? setInternalOpen;
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  const alreadyClosed = request.status === "resolved";
  // Q-04/Q-51: same localStorage draft + dirty-check machinery as the phone
  // close-out flow (close-out-draft.ts) — reopening this to edit an
  // already-closed request starts from what was ACTUALLY saved
  // (resolution_summary/resolution_recommendations), so that, not blank, is
  // the "pristine" baseline for "is there unsaved work?" below.
  const [initialDraft] = useState(() => readCloseOutDraft(request.id));
  const [summary, setSummary] = useState(initialDraft?.summary ?? request.resolution_summary ?? "");
  const [recommendations, setRecommendations] = useState(
    initialDraft?.recommendations ?? request.resolution_recommendations ?? ""
  );
  const [sendEmail, setSendEmail] = useState(initialDraft?.sendEmail ?? !!request.contact_email);
  const [emailTo, setEmailTo] = useState(initialDraft?.emailTo || request.contact_email || "");
  const skipDraftWrite = useRef(false);

  useEffect(() => {
    if (skipDraftWrite.current) {
      skipDraftWrite.current = false;
      return;
    }
    writeCloseOutDraft(request.id, { summary, recommendations, signedByName: "", sendEmail, emailTo });
  }, [request.id, summary, recommendations, sendEmail, emailTo]);

  const pristineFields: CloseOutFields = {
    summary: request.resolution_summary ?? "",
    recommendations: request.resolution_recommendations ?? "",
    signedByName: "",
    photoCount: 0,
    hasSignature: false,
  };
  const currentFields: CloseOutFields = {
    summary,
    recommendations,
    signedByName: "",
    photoCount: 0,
    hasSignature: false,
  };

  function resetToSaved() {
    skipDraftWrite.current = true;
    clearCloseOutDraft(request.id);
    setSummary(request.resolution_summary ?? "");
    setRecommendations(request.resolution_recommendations ?? "");
    setSendEmail(!!request.contact_email);
    setEmailTo(request.contact_email ?? "");
    setError(null);
    setConfirmDiscardOpen(false);
    setOpen(false);
  }

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

    skipDraftWrite.current = true;
    clearCloseOutDraft(request.id);
    setConfirmDiscardOpen(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next, eventDetails) => {
        if (next) {
          setOpen(true);
          return;
        }
        if (submitting) {
          eventDetails.cancel();
          return;
        }
        if (confirmDiscardOpen) {
          eventDetails.cancel();
          return;
        }
        if (isCloseOutDirty(currentFields, pristineFields)) {
          eventDetails.cancel();
          setConfirmDiscardOpen(true);
          return;
        }
        setOpen(false);
      }}
    >
      <DialogTrigger
        render={<Button variant={alreadyClosed ? "outline" : "default"}>
          {alreadyClosed ? (editTriggerLabel ?? "Edit close-out") : (triggerLabel ?? "Close out request")}
        </Button>}
      />
      <DialogContent>
        {confirmDiscardOpen ? (
          <>
            <DialogHeader>
              <DialogTitle>Discard your changes?</DialogTitle>
              <DialogDescription>
                The summary and recommendations you edited here haven&apos;t been saved.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setConfirmDiscardOpen(false)}>
                Keep editing
              </Button>
              <Button type="button" variant="destructive" onClick={resetToSaved}>
                Discard
              </Button>
            </DialogFooter>
          </>
        ) : (
        <>
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
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
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
              value={recommendations}
              onChange={(e) => setRecommendations(e.target.value)}
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
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
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
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}
