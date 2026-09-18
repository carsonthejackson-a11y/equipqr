"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Camera, Loader2, MessageSquare, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { downscaleToJpeg } from "@/lib/client-image";
import {
  buildStaffPhotoPath,
  buildStaffSignaturePath,
  firstNameOf,
  formatCloseOutSummarySms,
  validateCloseOut,
} from "@/lib/staff-scan";
import {
  clearCloseOutDraft,
  isCloseOutDirty,
  readCloseOutDraft,
  writeCloseOutDraft,
  type CloseOutFields,
} from "@/lib/close-out-draft";
import { smsHref } from "@/lib/contact-links";
import { publicEnv } from "@/lib/env";
import { SignaturePad, type SignaturePadHandle } from "@/components/signature-pad";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { assertStaffUploadsAllowed, closeOutFromScan } from "../staff-actions";

// One screen, on the phone, to finish a job: what was done, before/after
// photos, an optional customer signature, and whether to email a summary.
// Used both from an open request's "Close out" button and from "Log a
// visit" (which creates the request first, then opens this in the same
// state a normal close-out would be).
//
// Q-04/Q-51/Q-54: this used to reset and close itself the instant a save
// succeeded, and closing it any other way (the X, the backdrop, Escape)
// silently dropped whatever the technician had typed or photographed with
// no warning at all. Three things fix that:
//  1. A localStorage draft of the text fields, per request, recovered if
//     the tech left and came back (close-out-draft.ts).
//  2. Dismissing while there's unsaved work (typed text, a photo, a
//     signature) cancels the native close and asks first.
//  3. A save doesn't just close — it shows a small success view with
//     "Back to Today" and, when no email actually went out, a "Text {name}
//     a summary" fallback sent from the technician's own phone.

type Photo = { id: string; file: File; previewUrl: string; caption: "Before" | "After" };

const MAX_PHOTOS = 8;

export function CloseOutDialog({
  open,
  onOpenChange,
  qrToken,
  requestId,
  companyId,
  companyName,
  defaultContactName,
  defaultEmail,
  contactPhone,
  publicToken,
  onClosedOut,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  qrToken: string;
  requestId: string;
  companyId: string;
  /** For the "Text {name} a summary" success-screen SMS fallback (Q-54). */
  companyName: string;
  defaultContactName?: string;
  defaultEmail: string | null;
  /** Same purpose as defaultEmail — the SMS fallback needs a number to text. */
  contactPhone: string | null;
  /** This request's public /r/<token> status-page token, linked from the SMS fallback. */
  publicToken: string;
  /** Called once the request is actually resolved — lets a caller (e.g. Log a visit) clear its own pending state. */
  onClosedOut?: () => void;
}) {
  const router = useRouter();

  // Q-51: recovered once, on mount — never re-read after, so it can't stomp
  // over what the technician is actively typing.
  const [initialDraft] = useState(() => readCloseOutDraft(requestId));
  const [summary, setSummary] = useState(initialDraft?.summary ?? "");
  const [recommendations, setRecommendations] = useState(initialDraft?.recommendations ?? "");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [signedByName, setSignedByName] = useState(initialDraft?.signedByName || defaultContactName || "");
  const [sendEmail, setSendEmail] = useState(initialDraft?.sendEmail ?? !!defaultEmail);
  const [emailTo, setEmailTo] = useState(initialDraft?.emailTo || defaultEmail || "");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const [closedOut, setClosedOut] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailAttempted, setEmailAttempted] = useState(false);

  const beforeInputRef = useRef<HTMLInputElement>(null);
  const afterInputRef = useRef<HTMLInputElement>(null);
  const signatureRef = useRef<SignaturePadHandle | null>(null);
  const [signatureEmpty, setSignatureEmpty] = useState(true);
  // Set right before a reset that should NOT immediately re-persist the
  // blank fields it produces as a "new" draft — see the write-effect below.
  //
  // Starts TRUE so the effect's mount run is skipped too. This dialog mounts
  // (closed) on every request card, and the mount run used to persist the
  // untouched defaults as a "draft" for each of them — including
  // `sendEmail: false` whenever the customer had no email at the time. That
  // stored false then won over `!!defaultEmail` on the next visit, after the
  // customer had added one, and the resolution email was silently skipped.
  // Only a real edit should create a draft.
  const skipDraftWrite = useRef(true);
  // The field values this dialog mounted with. While the fields still equal
  // them and no draft was restored, there is nothing worth keeping — so the
  // effect clears rather than writes. That also covers React StrictMode's
  // dev-only double effect run (which re-enters after skipDraftWrite has
  // already been cleared) and a draft the technician typed back to blank.
  const mountedWith = useRef({ summary, recommendations, signedByName, sendEmail, emailTo });

  // Q-51: best-effort autosave of the text fields on every change. Photos
  // and the signature can't reasonably round-trip through localStorage, so
  // they're not part of this — losing them on a true page reload (as
  // opposed to just dismissing this dialog, which is guarded separately
  // below) is an accepted limit of a plain file input.
  useEffect(() => {
    if (skipDraftWrite.current) {
      skipDraftWrite.current = false;
      return;
    }
    const base = mountedWith.current;
    const untouched =
      !initialDraft &&
      summary === base.summary &&
      recommendations === base.recommendations &&
      signedByName === base.signedByName &&
      sendEmail === base.sendEmail &&
      emailTo === base.emailTo;
    if (untouched) {
      clearCloseOutDraft(requestId);
      return;
    }
    writeCloseOutDraft(requestId, { summary, recommendations, signedByName, sendEmail, emailTo });
  }, [requestId, initialDraft, summary, recommendations, signedByName, sendEmail, emailTo]);

  // Q-04: what a brand-new close-out looks like before anyone touches it —
  // the baseline for "is there unsaved work?". Deliberately NOT the
  // restored draft above: if a draft WAS restored, the form already differs
  // from this, so dismissing it unconfirmed is correctly treated as
  // discarding real work, not as a no-op.
  //
  // sendEmail/emailTo are part of the localStorage draft (recovered above)
  // but deliberately NOT part of this dirty check: they're a one-tap toggle
  // and a short address, trivial to redo, unlike a typed summary, a photo,
  // or a signature — the confirmation below is for the expensive-to-lose
  // stuff, not every field on the form.
  const initialFields: CloseOutFields = {
    summary: "",
    recommendations: "",
    signedByName: defaultContactName ?? "",
    photoCount: 0,
    hasSignature: false,
  };
  const currentFields: CloseOutFields = {
    summary,
    recommendations,
    signedByName,
    photoCount: photos.length,
    hasSignature: !signatureEmpty,
  };

  function addPhoto(caption: "Before" | "After", files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    // Snapshot the FileList now: it is live, and the input's value is cleared
    // right after this call. Reading it inside the state updater (which React
    // may run later, once other state is pending) would find it empty and
    // silently drop the photos — e.g. whenever the summary was typed first.
    const picked = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      caption,
    }));
    setPhotos((current) => {
      const next = [...current, ...picked];
      for (const dropped of next.slice(MAX_PHOTOS)) URL.revokeObjectURL(dropped.previewUrl);
      return next.slice(0, MAX_PHOTOS);
    });
  }

  function removePhoto(id: string) {
    setPhotos((current) => {
      const target = current.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((p) => p.id !== id);
    });
  }

  /** Really discards (or finishes) everything: clears the draft, resets every field, and actually closes. */
  function resetAndClose() {
    for (const p of photos) URL.revokeObjectURL(p.previewUrl);
    skipDraftWrite.current = true;
    clearCloseOutDraft(requestId);
    setSummary("");
    setRecommendations("");
    setPhotos([]);
    setSignedByName(defaultContactName ?? "");
    setSendEmail(!!defaultEmail);
    setEmailTo(defaultEmail ?? "");
    setError(null);
    setConfirmDiscardOpen(false);
    setClosedOut(false);
    setEmailSent(false);
    setEmailAttempted(false);
    signatureRef.current?.clear();
    onOpenChange(false);
  }

  async function handleSubmit() {
    setError(null);
    const validationError = validateCloseOut({ summary, sendEmail, emailTo });
    if (validationError) {
      setError(validationError);
      return;
    }

    // C1-33: checked before the upload loop below starts, not just inside
    // closeOutFromScan afterward — a locked company shouldn't get photos and
    // a signature sitting in Storage for a close-out that can never save.
    const lockError = await assertStaffUploadsAllowed();
    if (lockError) {
      setError(lockError.error);
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createClient();
      const uploadedMedia: { path: string; caption: string }[] = [];

      for (const [index, photo] of photos.entries()) {
        setProgress(`Uploading photo ${index + 1} of ${photos.length}…`);
        const jpeg = await downscaleToJpeg(photo.file);
        const path = buildStaffPhotoPath(companyId, requestId, crypto.randomUUID());
        const { error: uploadError } = await supabase.storage
          .from("service-request-media")
          .upload(path, jpeg, { contentType: "image/jpeg" });
        if (uploadError) {
          throw new Error(`Couldn't upload a photo: ${uploadError.message}`);
        }
        uploadedMedia.push({ path, caption: photo.caption });
      }

      let signaturePath: string | null = null;
      if (!signatureRef.current?.isEmpty()) {
        const blob = await signatureRef.current?.toBlob();
        if (blob) {
          setProgress("Saving signature…");
          signaturePath = buildStaffSignaturePath(companyId, requestId);
          const { error: sigError } = await supabase.storage
            .from("service-request-media")
            .upload(signaturePath, blob, { contentType: "image/png", upsert: true });
          if (sigError) {
            throw new Error(`Couldn't save the signature: ${sigError.message}`);
          }
        }
      }

      setProgress("Saving…");
      const result = await closeOutFromScan(qrToken, requestId, {
        summary,
        recommendations,
        media: uploadedMedia,
        signaturePath,
        signedByName: signaturePath ? signedByName.trim() || null : null,
        sendEmail,
        emailTo,
      });

      if ("error" in result) {
        throw new Error(result.error);
      }

      if (result.emailAttempted && !result.emailSent) {
        toast.warning("Closed, but the email couldn't be sent.");
      }

      onClosedOut?.();
      skipDraftWrite.current = true;
      clearCloseOutDraft(requestId);
      setEmailSent(result.emailSent);
      setEmailAttempted(result.emailAttempted);
      setClosedOut(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  }

  const statusUrl = `${publicEnv.NEXT_PUBLIC_APP_URL}/r/${publicToken}`;
  const offerTextSummary = !emailSent && !!contactPhone;

  return (
    <Dialog
      open={open}
      onOpenChange={(next, eventDetails) => {
        if (next) {
          onOpenChange(next);
          return;
        }
        // Never let a close in progress get dismissed out from under itself
        // — the upload loop is already writing to Storage.
        if (submitting) {
          eventDetails.cancel();
          return;
        }
        // Already saved: nothing left to lose, close for real.
        if (closedOut) {
          resetAndClose();
          return;
        }
        // The confirm prompt is already up — any other dismiss attempt
        // (Escape again, a backdrop press) keeps it up rather than quietly
        // discarding; only its own "Discard" button does that.
        if (confirmDiscardOpen) {
          eventDetails.cancel();
          return;
        }
        if (isCloseOutDirty(currentFields, initialFields)) {
          eventDetails.cancel();
          setConfirmDiscardOpen(true);
          return;
        }
        resetAndClose();
      }}
    >
      <DialogContent className="flex max-h-[92vh] w-[calc(100%-1.5rem)] flex-col overflow-hidden sm:max-w-md">
        {closedOut ? (
          <>
            <DialogHeader>
              <DialogTitle>Closed out</DialogTitle>
              <DialogDescription>
                {emailAttempted && !emailSent
                  ? "Saved, but the email couldn't be sent."
                  : emailSent
                    ? `Emailed ${emailTo || "the customer"} a summary.`
                    : "Saved."}
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 space-y-2 overflow-y-auto">
              {offerTextSummary && (
                <a
                  href={smsHref(
                    contactPhone!,
                    formatCloseOutSummarySms(defaultContactName ?? "", companyName, statusUrl)
                  )}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-xl border text-base font-medium"
                >
                  <MessageSquare className="size-4" aria-hidden />
                  Text {firstNameOf(defaultContactName ?? "", "them")} a summary
                </a>
              )}
            </div>
            <DialogFooter>
              <Button
                render={<Link href="/dashboard/today" />}
                nativeButton={false}
                onClick={resetAndClose}
                className="h-14 w-full text-base font-semibold sm:w-full"
              >
                Back to Today
              </Button>
            </DialogFooter>
          </>
        ) : confirmDiscardOpen ? (
          <>
            <DialogHeader>
              <DialogTitle>Discard close-out?</DialogTitle>
              <DialogDescription>
                Your summary, photos and signature for this visit will be lost.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmDiscardOpen(false)}
                className="h-14 w-full text-base font-semibold sm:w-full"
              >
                Keep editing
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={resetAndClose}
                className="h-14 w-full text-base font-semibold sm:w-full"
              >
                Discard
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Close out</DialogTitle>
              <DialogDescription>Record what was done. This resolves the request.</DialogDescription>
            </DialogHeader>

            <div className="flex-1 space-y-5 overflow-y-auto">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="close-out-summary" className="text-base">
                  Summary of work performed
                </Label>
                <Textarea
                  id="close-out-summary"
                  rows={4}
                  className="text-base"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="What did you do to fix this?"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="close-out-recommendations" className="text-base">
                  Recommendations (optional)
                </Label>
                <Textarea
                  id="close-out-recommendations"
                  rows={3}
                  className="text-base"
                  value={recommendations}
                  onChange={(e) => setRecommendations(e.target.value)}
                  placeholder="Anything the customer should plan for?"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-base">Before / after photos</Label>
                <input
                  ref={beforeInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    addPhoto("Before", e.target.files);
                    e.target.value = "";
                  }}
                />
                <input
                  ref={afterInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    addPhoto("After", e.target.files);
                    e.target.value = "";
                  }}
                />
                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={photos.length >= MAX_PHOTOS}
                    onClick={() => beforeInputRef.current?.click()}
                    className="flex min-h-[56px] flex-1 items-center justify-center gap-2 rounded-xl border text-base font-medium disabled:opacity-50"
                  >
                    <Camera className="size-5" aria-hidden />
                    Before
                  </button>
                  <button
                    type="button"
                    disabled={photos.length >= MAX_PHOTOS}
                    onClick={() => afterInputRef.current?.click()}
                    className="flex min-h-[56px] flex-1 items-center justify-center gap-2 rounded-xl border text-base font-medium disabled:opacity-50"
                  >
                    <Camera className="size-5" aria-hidden />
                    After
                  </button>
                </div>
                {photos.length > 0 && (
                  <ul className="grid grid-cols-3 gap-2">
                    {photos.map((photo) => (
                      <li key={photo.id} className="relative">
                        {/* Object URL for a just-picked file — nothing to optimise. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo.previewUrl}
                          alt={photo.caption}
                          className="aspect-square w-full rounded-lg border object-cover"
                        />
                        <span className="absolute bottom-1 left-1 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-medium">
                          {photo.caption}
                        </span>
                        <button
                          type="button"
                          onClick={() => removePhoto(photo.id)}
                          aria-label={`Remove photo`}
                          className="absolute -top-2 -right-2 flex size-7 items-center justify-center rounded-full border bg-background shadow-sm"
                        >
                          <X className="size-3.5" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-base">Customer signature (optional)</Label>
                <SignaturePad
                  onReady={(handle) => (signatureRef.current = handle)}
                  onChange={setSignatureEmpty}
                />
                {!signatureEmpty && (
                  <div className="space-y-1.5">
                    <Label htmlFor="close-out-signed-by" className="text-sm text-muted-foreground">
                      Signed by
                    </Label>
                    <Input
                      id="close-out-signed-by"
                      className="h-12 text-base"
                      value={signedByName}
                      onChange={(e) => setSignedByName(e.target.value)}
                      placeholder="Customer's name"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="close-out-send-email"
                    checked={sendEmail}
                    onCheckedChange={(checked) => setSendEmail(checked === true)}
                  />
                  <Label htmlFor="close-out-send-email" className="font-normal">
                    Email the customer a summary
                  </Label>
                </div>
                {sendEmail && (
                  <Input
                    type="email"
                    className="h-12 text-base"
                    value={emailTo}
                    onChange={(e) => setEmailTo(e.target.value)}
                    placeholder="customer@example.com"
                  />
                )}
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                disabled={submitting}
                onClick={handleSubmit}
                className={cn("h-14 w-full text-base font-semibold sm:w-full")}
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    {progress ?? "Saving…"}
                  </>
                ) : (
                  "Close out request"
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
