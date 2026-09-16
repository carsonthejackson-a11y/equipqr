"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check, Images, Phone, MessageSquare, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { phoneHref, type ResolvedBranding } from "@/lib/branding";
import {
  DEFAULT_PRIORITY_CHOICE,
  firstErrorField,
  HAZARD_WARNING,
  hasDraftContent,
  hasHazardLanguage,
  MAX_DESCRIPTION_LENGTH,
  MAX_MEDIA_ITEMS,
  parseReportDraft,
  PRIORITY_CHOICES,
  priorityFromChoice,
  openRequestStorageKey,
  reportDraftStorageKey,
  requestReference,
  type PriorityChoice,
} from "@/lib/public-request";
import { cn } from "@/lib/utils";

// Field order the form renders in, for scroll-to-first-error (Q-58).
const FIELD_ORDER = ["description", "contactName", "contactPhone", "contactEmail"] as const;
type FieldName = (typeof FIELD_ORDER)[number];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ReportDraft = {
  description: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  priority: PriorityChoice;
};

/** See the comment on `initialDraft` in the component below for why this runs as a lazy `useState` initializer rather than inside a `useEffect`. */
function readInitialDraft(qrToken: string): ReportDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const draft = parseReportDraft(localStorage.getItem(reportDraftStorageKey(qrToken)));
    if (!draft) return null;
    const textFields = {
      description: draft.description ?? "",
      contactName: draft.contactName ?? "",
      contactEmail: draft.contactEmail ?? "",
      contactPhone: draft.contactPhone ?? "",
    };
    if (!hasDraftContent(textFields)) return null;
    const priority =
      draft.priority && PRIORITY_CHOICES.some((c) => c.value === draft.priority)
        ? (draft.priority as PriorityChoice)
        : DEFAULT_PRIORITY_CHOICE;
    return { ...textFields, priority };
  } catch {
    return null;
  }
}

// Camera first: the customer is already standing in front of the problem, so
// the fastest useful thing they can do is photograph it. Images are downscaled
// in the browser before upload — a modern phone camera produces 4–8MB frames
// and three of those over a bad signal in a plant basement is a failed
// submission. 1600px on the long edge at JPEG 0.85 is still plenty for a
// technician to see a cracked hose or an error code, at roughly a tenth the
// bytes. Video is left untouched (re-encoding it in a browser tab isn't
// realistic) and keeps the 25MB cap.

const MAX_FILE_SIZE_MB = 25;
const MAX_IMAGE_EDGE = 1600;
const JPEG_QUALITY = 0.85;

type PathEntry = { question: string; answer: string };
type Attachment = { file: File; previewUrl: string; isVideo: boolean };

function pathStorageKey(qrToken: string) {
  return `troubleshooting-path-${qrToken}`;
}

/**
 * Re-encodes an image to at most {@link MAX_IMAGE_EDGE}px on its long edge.
 * Returns the original file untouched if anything at all goes wrong (unknown
 * codec, memory pressure, an already-small file) — a slightly larger upload
 * is always better than a lost report.
 */
async function downscaleImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1_000_000) {
      bitmap.close?.();
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export function ServiceRequestForm({
  qrToken,
  branding,
}: {
  qrToken: string;
  branding: ResolvedBranding;
}) {
  // Lazy initializer, not an effect: read any saved draft once, on this
  // component's very first render (Q-54). `typeof window === "undefined"` on
  // the server, so SSR always starts blank like a fresh visit; React doesn't
  // diff controlled form elements' `value` during hydration (unlike text
  // content), so the client picking up a real draft immediately afterwards
  // doesn't produce a hydration-mismatch warning. This is also what keeps
  // this out of a `useEffect` — see the comment on `readStoredPinPass` in
  // ../owner/owner-report-form.tsx for why this codebase avoids setState
  // inside a mount effect for exactly this "browser knows something the
  // server render can't" shape.
  const [initialDraft] = useState(() => readInitialDraft(qrToken));
  const [description, setDescription] = useState(initialDraft?.description ?? "");
  const [priority, setPriority] = useState<PriorityChoice>(initialDraft?.priority ?? DEFAULT_PRIORITY_CHOICE);
  const [contactName, setContactName] = useState(initialDraft?.contactName ?? "");
  const [contactEmail, setContactEmail] = useState(initialDraft?.contactEmail ?? "");
  const [contactPhone, setContactPhone] = useState(initialDraft?.contactPhone ?? "");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [restoredDraft, setRestoredDraft] = useState(!!initialDraft);
  const [progress, setProgress] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState<{ reference: string; statusUrl: string } | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const fieldWrapperRefs = useRef<Partial<Record<FieldName, HTMLDivElement | null>>>({});

  function clearFieldError(field: FieldName) {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function focusField(field: FieldName) {
    const wrapper = fieldWrapperRefs.current[field];
    if (!wrapper) return;
    wrapper.scrollIntoView({ behavior: "smooth", block: "center" });
    wrapper.querySelector<HTMLElement>("input, textarea")?.focus();
  }

  // Object URLs are only freed when the component goes away; freeing them as
  // attachments change would blank thumbnails that are still on screen.
  useEffect(() => {
    return () => {
      for (const a of attachments) URL.revokeObjectURL(a.previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the draft current as the visitor types, so a killed tab loses
  // nothing. Cleared once there's no meaningful text left to save.
  useEffect(() => {
    try {
      const key = reportDraftStorageKey(qrToken);
      const textFields = { description, contactName, contactEmail, contactPhone };
      if (hasDraftContent(textFields)) {
        localStorage.setItem(key, JSON.stringify({ ...textFields, priority }));
      } else {
        localStorage.removeItem(key);
      }
    } catch {
      /* best effort */
    }
  }, [description, contactName, contactEmail, contactPhone, priority, qrToken]);

  function getTroubleshootingPath(): PathEntry[] {
    try {
      const stored = sessionStorage.getItem(pathStorageKey(qrToken));
      return stored ? (JSON.parse(stored) as PathEntry[]) : [];
    } catch {
      return [];
    }
  }

  function handleFilesSelected(selected: FileList | null) {
    if (!selected?.length) return;
    setError(null);

    const incoming = Array.from(selected);
    const tooBig = incoming.find((f) => f.size > MAX_FILE_SIZE_MB * 1024 * 1024);
    if (tooBig) {
      setError(`"${tooBig.name}" is larger than ${MAX_FILE_SIZE_MB}MB`);
      return;
    }

    setAttachments((current) =>
      [
        ...current,
        ...incoming.map((file) => ({
          file,
          previewUrl: URL.createObjectURL(file),
          isVideo: file.type.startsWith("video/"),
        })),
      ].slice(0, MAX_MEDIA_ITEMS)
    );
  }

  function removeAttachment(index: number) {
    setAttachments((current) => {
      const target = current[index];
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((_, i) => i !== index);
    });
  }

  function validate(): Partial<Record<FieldName, string>> {
    const errors: Partial<Record<FieldName, string>> = {};
    if (!description.trim()) errors.description = "Please describe the problem";
    if (!contactName.trim()) errors.contactName = "Please enter your name";
    if (!contactEmail.trim() && !contactPhone.trim()) {
      errors.contactPhone = "Add a phone number or an email so we can reach you";
    } else if (contactEmail.trim() && !EMAIL_PATTERN.test(contactEmail.trim())) {
      errors.contactEmail = "Enter a valid email address";
    }
    return errors;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const errors = validate();
    setFieldErrors(errors);
    const firstField = firstErrorField(errors, FIELD_ORDER) as FieldName | null;
    if (firstField) {
      focusField(firstField);
      return;
    }

    setSubmitting(true);

    try {
      const supabase = createClient();
      const media: { storage_path: string; media_type: "image" | "video" }[] = [];

      for (const [index, attachment] of attachments.entries()) {
        setProgress(`Uploading ${index + 1} of ${attachments.length}…`);
        const file = attachment.isVideo ? attachment.file : await downscaleImage(attachment.file);
        const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
        const path = `${qrToken}/${crypto.randomUUID()}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from("service-request-media")
          .upload(path, file, { contentType: file.type });

        if (uploadError) {
          throw new Error(`Couldn't upload ${attachment.file.name}: ${uploadError.message}`);
        }

        media.push({ storage_path: path, media_type: attachment.isVideo ? "video" : "image" });
      }

      setProgress("Sending your request…");

      const response = await fetch("/api/service-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qrToken,
          description,
          contactName,
          contactEmail,
          contactPhone,
          priority: priorityFromChoice(priority),
          media,
          troubleshootingPath: getTroubleshootingPath(),
        }),
      });

      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        publicToken?: string;
        statusUrl?: string;
      };

      if (!response.ok) {
        throw new Error(body.error ?? "Something went wrong submitting your request");
      }

      const statusUrl = body.statusUrl ?? (body.publicToken ? `/r/${body.publicToken}` : "");

      try {
        sessionStorage.removeItem(pathStorageKey(qrToken));
        if (statusUrl) sessionStorage.setItem(openRequestStorageKey(qrToken), statusUrl);
        localStorage.removeItem(reportDraftStorageKey(qrToken));
      } catch {
        /* best effort — the emailed link is the durable way back */
      }

      setSent({ reference: requestReference(body.publicToken ?? ""), statusUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  }

  if (sent) {
    return (
      <div className="space-y-5">
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-[var(--brand)] text-[var(--brand-on)]">
            <Check className="size-7" aria-hidden />
          </span>
          <h2 className="text-xl font-semibold">Request sent</h2>
          <p className="text-muted-foreground">
            {branding.companyName} has it and will be in touch.
          </p>
        </div>

        <div className="rounded-xl border px-4 py-3 text-center">
          <p className="text-sm text-muted-foreground">Your reference</p>
          <p className="font-mono text-lg font-semibold tracking-wider">{sent.reference}</p>
        </div>

        {sent.statusUrl && (
          <a
            href={sent.statusUrl}
            className="flex min-h-[52px] w-full items-center justify-center rounded-xl bg-[var(--brand)] px-4 text-base font-semibold text-[var(--brand-on)]"
          >
            Track this request
          </a>
        )}

        {(branding.phone || branding.smsNumber) && (
          <div className="flex gap-3">
            {branding.phone && (
              <a
                href={phoneHref("tel", branding.phone)}
                className="flex min-h-[52px] min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border text-base font-medium"
              >
                <Phone className="size-5 shrink-0" aria-hidden />
                <span className="truncate">Call {branding.companyName}</span>
              </a>
            )}
            {branding.smsNumber && (
              <a
                href={phoneHref("sms", branding.smsNumber)}
                className="flex min-h-[52px] min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border text-base font-medium"
              >
                <MessageSquare className="size-5 shrink-0" aria-hidden />
                <span className="truncate">Text {branding.companyName}</span>
              </a>
            )}
          </div>
        )}
      </div>
    );
  }

  const atLimit = attachments.length >= MAX_MEDIA_ITEMS;
  const hazardDetected = hasHazardLanguage(description);

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {hazardDetected && (
        <Alert variant="destructive">
          <AlertDescription>{HAZARD_WARNING}</AlertDescription>
        </Alert>
      )}

      {restoredDraft && (
        <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          <span>Restored your draft.</span>
          <button
            type="button"
            onClick={() => setRestoredDraft(false)}
            className="shrink-0 font-medium underline underline-offset-2"
          >
            Dismiss
          </button>
        </div>
      )}

      <div
        className="space-y-2"
        ref={(el) => {
          fieldWrapperRefs.current.description = el;
        }}
      >
        <Label htmlFor="description" className="text-base">
          What&apos;s wrong?
        </Label>
        <Textarea
          id="description"
          rows={4}
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            clearFieldError("description");
          }}
          placeholder="It's making a grinding noise and won't start…"
          maxLength={MAX_DESCRIPTION_LENGTH}
          required
          aria-invalid={!!fieldErrors.description}
          aria-describedby={fieldErrors.description ? "description-error" : undefined}
        />
        {fieldErrors.description && (
          <p id="description-error" role="alert" className="text-sm text-destructive">
            {fieldErrors.description}
          </p>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="text-base font-medium">How urgent is this?</legend>
        <div className="flex flex-col gap-2">
          {PRIORITY_CHOICES.map((choice) => (
            <label
              key={choice.value}
              className={cn(
                "flex min-h-[52px] cursor-pointer items-center gap-3 rounded-xl border px-4 py-2.5",
                priority === choice.value && "border-[var(--brand)] bg-[var(--brand)]/10"
              )}
            >
              <input
                type="radio"
                name="priority"
                value={choice.value}
                checked={priority === choice.value}
                onChange={() => setPriority(choice.value)}
                className="size-5 accent-[var(--brand)]"
              />
              <span>
                <span className="block font-medium">{choice.label}</span>
                <span className="block text-sm text-muted-foreground">{choice.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <Label className="text-base">Photos or video</Label>
        <p className="text-sm text-muted-foreground">
          A picture of the problem (or the model plate) gets it fixed faster.
        </p>

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            handleFilesSelected(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={libraryInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFilesSelected(e.target.files);
            e.target.value = "";
          }}
        />

        <div className="flex gap-3">
          <button
            type="button"
            disabled={atLimit}
            onClick={() => cameraInputRef.current?.click()}
            className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl border border-transparent bg-[var(--brand)] text-base font-medium text-[var(--brand-on)] disabled:opacity-50"
          >
            <Camera className="size-5" aria-hidden />
            Take a photo
          </button>
          <button
            type="button"
            disabled={atLimit}
            onClick={() => libraryInputRef.current?.click()}
            className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl border text-base font-medium disabled:opacity-50"
          >
            <Images className="size-5" aria-hidden />
            Choose files
          </button>
        </div>

        {attachments.length > 0 && (
          <ul className="mt-3 grid grid-cols-3 gap-2">
            {attachments.map((attachment, index) => (
              <li key={attachment.previewUrl} className="relative">
                {attachment.isVideo ? (
                  <video
                    src={attachment.previewUrl}
                    className="aspect-square w-full rounded-lg border object-cover"
                    muted
                    playsInline
                  />
                ) : (
                  // Object URL for a file the user just picked — no remote
                  // origin for next/image to optimise.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={attachment.previewUrl}
                    alt=""
                    className="aspect-square w-full rounded-lg border object-cover"
                  />
                )}
                <button
                  type="button"
                  onClick={() => removeAttachment(index)}
                  aria-label={`Remove ${attachment.file.name}`}
                  className="absolute -top-2 -right-2 flex size-8 items-center justify-center rounded-full border bg-background shadow-sm"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        {atLimit && (
          <p className="text-sm text-muted-foreground">
            That&apos;s the maximum of {MAX_MEDIA_ITEMS} attachments.
          </p>
        )}
      </div>

      <div className="space-y-4">
        <div
          className="space-y-2"
          ref={(el) => {
            fieldWrapperRefs.current.contactName = el;
          }}
        >
          <Label htmlFor="contactName" className="text-base">
            Your name
          </Label>
          <Input
            id="contactName"
            className="h-12 text-base"
            autoComplete="name"
            value={contactName}
            onChange={(e) => {
              setContactName(e.target.value);
              clearFieldError("contactName");
            }}
            maxLength={120}
            required
            aria-invalid={!!fieldErrors.contactName}
            aria-describedby={fieldErrors.contactName ? "contactName-error" : undefined}
          />
          {fieldErrors.contactName && (
            <p id="contactName-error" role="alert" className="text-sm text-destructive">
              {fieldErrors.contactName}
            </p>
          )}
        </div>

        <div
          className="space-y-2"
          ref={(el) => {
            fieldWrapperRefs.current.contactPhone = el;
          }}
        >
          <Label htmlFor="contactPhone" className="text-base">
            Phone
          </Label>
          <Input
            id="contactPhone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className="h-12 text-base"
            value={contactPhone}
            onChange={(e) => {
              setContactPhone(e.target.value);
              clearFieldError("contactPhone");
            }}
            maxLength={40}
            aria-invalid={!!fieldErrors.contactPhone}
            aria-describedby={fieldErrors.contactPhone ? "contactPhone-error" : undefined}
          />
          {fieldErrors.contactPhone && (
            <p id="contactPhone-error" role="alert" className="text-sm text-destructive">
              {fieldErrors.contactPhone}
            </p>
          )}
        </div>

        <div
          className="space-y-2"
          ref={(el) => {
            fieldWrapperRefs.current.contactEmail = el;
          }}
        >
          <Label htmlFor="contactEmail" className="text-base">
            Email
          </Label>
          <Input
            id="contactEmail"
            type="email"
            inputMode="email"
            autoComplete="email"
            className="h-12 text-base"
            value={contactEmail}
            onChange={(e) => {
              setContactEmail(e.target.value);
              clearFieldError("contactEmail");
            }}
            maxLength={200}
            aria-invalid={!!fieldErrors.contactEmail}
            aria-describedby={fieldErrors.contactEmail ? "contactEmail-error" : "contactEmail-hint"}
          />
          {fieldErrors.contactEmail ? (
            <p id="contactEmail-error" role="alert" className="text-sm text-destructive">
              {fieldErrors.contactEmail}
            </p>
          ) : (
            <p id="contactEmail-hint" className="text-sm text-muted-foreground">
              A phone number or an email — whichever is easier. We&apos;ll use it to reach you about
              this request.
            </p>
          )}
        </div>
      </div>

      <Button
        type="submit"
        disabled={submitting}
        className="h-14 w-full bg-[var(--brand)] text-base font-semibold text-[var(--brand-on)] hover:opacity-90"
      >
        {progress ?? (submitting ? "Sending…" : "Send request")}
      </Button>
    </form>
  );
}
