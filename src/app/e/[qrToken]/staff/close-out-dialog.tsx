"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { downscaleToJpeg } from "@/lib/client-image";
import { buildStaffPhotoPath, buildStaffSignaturePath, validateCloseOut } from "@/lib/staff-scan";
import { SignaturePad, type SignaturePadHandle } from "@/components/signature-pad";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { closeOutFromScan } from "../staff-actions";

// One screen, on the phone, to finish a job: what was done, before/after
// photos, an optional customer signature, and whether to email a summary.
// Used both from an open request's "Close out" button and from "Log a
// visit" (which creates the request first, then opens this in the same
// state a normal close-out would be).

type Photo = { id: string; file: File; previewUrl: string; caption: "Before" | "After" };

const MAX_PHOTOS = 8;

export function CloseOutDialog({
  open,
  onOpenChange,
  qrToken,
  requestId,
  companyId,
  defaultContactName,
  defaultEmail,
  onClosedOut,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  qrToken: string;
  requestId: string;
  companyId: string;
  defaultContactName?: string;
  defaultEmail: string | null;
  /** Called once the request is actually resolved — lets a caller (e.g. Log a visit) clear its own pending state. */
  onClosedOut?: () => void;
}) {
  const router = useRouter();
  const [summary, setSummary] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [signedByName, setSignedByName] = useState(defaultContactName ?? "");
  const [sendEmail, setSendEmail] = useState(!!defaultEmail);
  const [emailTo, setEmailTo] = useState(defaultEmail ?? "");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const beforeInputRef = useRef<HTMLInputElement>(null);
  const afterInputRef = useRef<HTMLInputElement>(null);
  const signatureRef = useRef<SignaturePadHandle | null>(null);
  const [signatureEmpty, setSignatureEmpty] = useState(true);

  function addPhoto(caption: "Before" | "After", files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setPhotos((current) =>
      [
        ...current,
        ...Array.from(files).map((file) => ({
          id: crypto.randomUUID(),
          file,
          previewUrl: URL.createObjectURL(file),
          caption,
        })),
      ].slice(0, MAX_PHOTOS)
    );
  }

  function removePhoto(id: string) {
    setPhotos((current) => {
      const target = current.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((p) => p.id !== id);
    });
  }

  function resetAndClose() {
    for (const p of photos) URL.revokeObjectURL(p.previewUrl);
    setSummary("");
    setRecommendations("");
    setPhotos([]);
    setSignedByName(defaultContactName ?? "");
    setSendEmail(!!defaultEmail);
    setEmailTo(defaultEmail ?? "");
    setError(null);
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
      } else if (result.emailSent) {
        toast.success("Closed out and emailed the customer");
      } else {
        toast.success("Closed out");
      }

      onClosedOut?.();
      resetAndClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(next) : resetAndClose())}>
      <DialogContent className="max-h-[92vh] w-[calc(100%-1.5rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Close out</DialogTitle>
          <DialogDescription>Record what was done. This resolves the request.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
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

          <Button
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            className={cn("h-14 w-full text-base font-semibold")}
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
