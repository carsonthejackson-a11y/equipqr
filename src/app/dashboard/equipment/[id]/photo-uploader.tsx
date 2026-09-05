"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { companyAssetUrl } from "@/lib/branding";
import { publicEnv } from "@/lib/env";
import { removeEquipmentPhoto, setEquipmentPhoto } from "../actions";

/** Longest edge of the stored photo. A field snapshot doesn't need more, and this keeps scan pages fast. */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;

/**
 * Downscales to at most MAX_EDGE on the long side and re-encodes as JPEG.
 * Done in the browser so a 12MP phone photo never crosses the wire — the
 * `company-assets` bucket is public and served straight to customers on the
 * scan page, so size matters more here than fidelity.
 */
async function downscaleToJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser couldn't process that image.");
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    if (!blob) throw new Error("Your browser couldn't process that image.");
    return blob;
  } finally {
    bitmap.close();
  }
}

export function PhotoUploader({
  equipmentId,
  companyId,
  photoPath,
  equipmentName,
}: {
  equipmentId: string;
  companyId: string;
  photoPath: string | null;
  equipmentName: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const photoUrl = companyAssetUrl(publicEnv.NEXT_PUBLIC_SUPABASE_URL, photoPath);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Let the same file be picked twice in a row (e.g. after a failed upload).
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Pick an image file (JPEG, PNG or HEIC).");
      return;
    }

    setError(null);
    setBusy(true);
    try {
      const blob = await downscaleToJpeg(file);
      const path = `${companyId}/equipment/${equipmentId}/photo-${Date.now()}.jpg`;

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("company-assets")
        .upload(path, blob, { contentType: "image/jpeg" });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const result = await setEquipmentPhoto(equipmentId, path);
      if (result?.error) {
        throw new Error(result.error);
      }

      toast.success(photoPath ? "Photo replaced" : "Photo added");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't upload that photo.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (!confirm("Remove this photo?")) return;
    setError(null);
    setBusy(true);
    const result = await removeEquipmentPhoto(equipmentId);
    setBusy(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    toast.success("Photo removed");
    router.refresh();
  }

  return (
    <div className="max-w-xl space-y-4">
      <p className="text-sm text-muted-foreground">
        One photo of the unit as installed. It shows on the customer&apos;s scan page, so they know
        they&apos;re looking at the right machine.
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {photoUrl ? (
        <div className="overflow-hidden rounded-lg border bg-muted">
          {/* Supabase storage isn't in next.config images.remotePatterns, and these are
              already downscaled on upload — same approach as the request media gallery. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoUrl}
            alt={`Photo of ${equipmentName}`}
            className="h-auto w-full object-contain"
          />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center text-muted-foreground">
          <div className="flex size-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <ImageOff className="size-5" />
          </div>
          <p className="max-w-sm text-sm">No photo yet.</p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />

      <div className="flex gap-2">
        <Button type="button" onClick={() => inputRef.current?.click()} disabled={busy}>
          <Camera className="size-4" />
          {busy ? "Uploading..." : photoPath ? "Replace photo" : "Add photo"}
        </Button>
        {photoPath && (
          <Button type="button" variant="outline" onClick={handleRemove} disabled={busy}>
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}
