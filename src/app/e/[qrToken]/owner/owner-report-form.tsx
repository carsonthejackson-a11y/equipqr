"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Camera, Images, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  DEFAULT_PRIORITY_CHOICE,
  MAX_DESCRIPTION_LENGTH,
  MAX_MEDIA_ITEMS,
  OWNER_PRIORITY_CHOICES,
  priorityFromChoice,
  sitePinStorageKey,
  type PriorityChoice,
} from "@/lib/public-request";
import { cn } from "@/lib/utils";
import type { EquipmentGuide } from "@/lib/types";
import { SitePinGate } from "./site-pin-gate";
import { OwnerConfirmation } from "./owner-confirmation";

// The owner-kind branch of the report form (docs/OWNER-ROADMAP-BRIEF.md
// §3.3.1-§3.3.2). Deliberately NOT sharing service-request-form.tsx's
// downscaleImage/attachment plumbing by export — duplicated verbatim below
// instead, so that file's diff stays exactly zero and a reviewer never has to
// wonder whether touching this form could change the provider-kind path.

const MAX_FILE_SIZE_MB = 25;
const MAX_IMAGE_EDGE = 1600;
const JPEG_QUALITY = 0.85;

const SOMETHING_ELSE = "Something else";
const GAS_SMELL_PATTERN = /gas smell/i;

type Attachment = { file: File; previewUrl: string; isVideo: boolean };

/**
 * Re-encodes an image to at most {@link MAX_IMAGE_EDGE}px on its long edge.
 * Returns the original file untouched if anything at all goes wrong (unknown
 * codec, memory pressure, an already-small file) — a slightly larger upload
 * is always better than a lost report. Verbatim copy of the provider form's
 * helper of the same name — see the module comment above for why.
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

type SentState = {
  vendor: { name: string; phone: string | null } | null;
  publicToken: string;
  statusUrl: string;
};

function subscribeNever() {
  // No real external store to subscribe to — see readStoredPinPass() below.
  return () => {};
}

/**
 * Reads the opaque site-PIN pass for one location (see sitePinStorageKey()).
 * Used only as a useSyncExternalStore getSnapshot — see the comment on
 * `storedPinPass` below for why, rather than a useEffect + setState (the
 * more obvious approach, and the one this file used at first: it works but
 * trips `react-hooks/set-state-in-effect`, and this codebase already has the
 * correct fix — src/components/relative-time.tsx — for exactly this
 * "browser knows something the server render can't" shape).
 */
function readStoredPinPass(pinRequired: boolean, locationId: string): string | null {
  if (!pinRequired || !locationId) return null;
  try {
    return localStorage.getItem(sitePinStorageKey(locationId));
  } catch {
    return null;
  }
}

export function OwnerReportForm({ qrToken, guide }: { qrToken: string; guide: EquipmentGuide }) {
  const pinRequired = !!guide.site_pin_required;
  const locationId = guide.location?.id ?? "";
  const locationName = guide.location?.name ?? null;

  // The server has no localStorage, so it always renders as if no pass is
  // stored (server snapshot: null) — docs/OWNER-ROADMAP-BRIEF.md §7.3. React
  // renders that same "null" on the client's first pass too (avoiding a
  // hydration mismatch), then immediately re-renders with the real value,
  // same as RelativeTime's tick. `overridePinPass` then takes over once the
  // visitor verifies a code or a stored pass gets rejected — see
  // handleSubmit() and SitePinGate's onVerified below.
  const storedPinPass = useSyncExternalStore(
    subscribeNever,
    () => readStoredPinPass(pinRequired, locationId),
    () => null
  );
  const [overridePinPass, setOverridePinPass] = useState<string | null | undefined>(undefined);
  const pinPass = overridePinPass !== undefined ? overridePinPass : storedPinPass;

  const chips = [...(guide.equipment_type.symptom_chips ?? []), SOMETHING_ELSE];
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<PriorityChoice>(DEFAULT_PRIORITY_CHOICE);
  const [contactName, setContactName] = useState("");
  const [reporterPhone, setReporterPhone] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState<SentState | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      for (const a of attachments) URL.revokeObjectURL(a.previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleSymptom(chip: string) {
    setError(null);
    setSelectedSymptoms((current) =>
      current.includes(chip) ? current.filter((c) => c !== chip) : [...current, chip]
    );
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!description.trim() && selectedSymptoms.length === 0) {
      return setError("Pick a symptom or tell us what's wrong");
    }
    if (!contactName.trim()) return setError("Please enter your name");

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

      const response = await fetch("/api/owner-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qrToken,
          description,
          contactName,
          reporterPhone,
          symptoms: selectedSymptoms,
          priority: priorityFromChoice(priority),
          media,
          pinPass: pinPass ?? "",
        }),
      });

      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        needsPin?: boolean;
        publicToken?: string;
        statusUrl?: string;
        vendor?: { name: string; phone: string | null } | null;
      };

      if (!response.ok) {
        if (body.needsPin) {
          // The stored pass was rejected (expired, or this is a different
          // location than expected) — re-open the gate rather than showing a
          // generic error the visitor can't act on.
          try {
            if (locationId) localStorage.removeItem(sitePinStorageKey(locationId));
          } catch {
            /* best effort */
          }
          setOverridePinPass(null);
          return;
        }
        throw new Error(body.error ?? "Something went wrong submitting your request");
      }

      setSent({
        vendor: body.vendor ?? null,
        publicToken: body.publicToken ?? "",
        statusUrl: body.statusUrl ?? (body.publicToken ? `/r/${body.publicToken}` : ""),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  }

  if (sent) {
    return (
      <OwnerConfirmation
        companyName={guide.company.name}
        vendor={sent.vendor}
        publicToken={sent.publicToken}
        statusUrl={sent.statusUrl}
      />
    );
  }

  if (pinRequired && !pinPass) {
    return (
      <SitePinGate
        qrToken={qrToken}
        locationId={locationId}
        locationName={locationName}
        onVerified={setOverridePinPass}
      />
    );
  }

  const atLimit = attachments.length >= MAX_MEDIA_ITEMS;
  const gasSmellSelected = selectedSymptoms.some((s) => GAS_SMELL_PATTERN.test(s));

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {gasSmellSelected && (
        <Alert variant="destructive">
          <AlertDescription>
            If you smell gas, leave the area now and call 911 and your gas utility. Send this
            afterwards.
          </AlertDescription>
        </Alert>
      )}

      <fieldset className="space-y-2">
        <legend className="text-base font-medium">What&apos;s wrong?</legend>
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => {
            const selected = selectedSymptoms.includes(chip);
            return (
              <button
                key={chip}
                type="button"
                onClick={() => toggleSymptom(chip)}
                aria-pressed={selected}
                className={cn(
                  "min-h-[44px] rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                  selected
                    ? "border-transparent bg-[var(--brand)] text-[var(--brand-on)]"
                    : "bg-background hover:bg-muted"
                )}
              >
                {chip}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="description" className="text-base">
          Anything else to add? (optional)
        </Label>
        <Textarea
          id="description"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add detail if a chip above doesn't cover it…"
          maxLength={MAX_DESCRIPTION_LENGTH}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-base font-medium">How urgent is this?</legend>
        <div className="flex flex-col gap-2">
          {OWNER_PRIORITY_CHOICES.map((choice) => (
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
        <div className="space-y-2">
          <Label htmlFor="contactName" className="text-base">
            Your name
          </Label>
          <Input
            id="contactName"
            className="h-12 text-base"
            autoComplete="name"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            maxLength={120}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="reporterPhone" className="text-base">
            Phone (optional)
          </Label>
          <Input
            id="reporterPhone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className="h-12 text-base"
            value={reporterPhone}
            onChange={(e) => setReporterPhone(e.target.value)}
            maxLength={40}
          />
          <p className="text-sm text-muted-foreground">
            In case the vendor needs to reach you on site.
          </p>
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
