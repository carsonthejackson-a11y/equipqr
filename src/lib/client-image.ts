// Browser-only image helpers shared by every upload surface (request form,
// equipment photo, close-out photos, inspection photos, nameplate OCR).
// Phones hand us 12-megapixel HEIC/JPEG files; nothing we do needs more than
// ~1600px on the long edge, and Storage egress is what we pay for.

import { formatBytes } from "@/lib/format";

export const DEFAULT_MAX_EDGE = 1600;
export const DEFAULT_JPEG_QUALITY = 0.85;

export type DownscaleOptions = {
  maxEdge?: number;
  quality?: number;
};

// Q-53: a downscale failure used to throw and drop the photo entirely. The
// report forms' own (separate) downscaler already falls back to the original
// file untouched — "a slightly larger upload is always better than a lost
// report" — capped so a failed downscale never silently ships something huge.
export const FALLBACK_MAX_BYTES = 12 * 1024 * 1024;

export type DownscaleFallbackDecision = { fallback: true } | { fallback: false; reason: string };

/**
 * Pure decision for what `downscaleToJpeg` does when it can't decode/
 * re-encode a picked file: fall back to the original untouched as long as
 * it's under `maxBytes`, otherwise refuse with a readable reason rather than
 * silently uploading something enormous. Separated out from the actual
 * canvas work below so it's testable without a real image/canvas.
 */
export function decideDownscaleFallback(
  fileSize: number,
  maxBytes: number = FALLBACK_MAX_BYTES
): DownscaleFallbackDecision {
  if (fileSize <= maxBytes) return { fallback: true };
  return {
    fallback: false,
    reason: `That photo is too large to upload (${formatBytes(fileSize)} — limit ${formatBytes(maxBytes)}). Try a smaller photo.`,
  };
}

/**
 * Downscales an image File/Blob to a JPEG no larger than `maxEdge` on its
 * long side. If the browser can't decode/re-encode it (an odd format, a
 * corrupt capture, no canvas support), falls back to the original file
 * (Q-53) rather than losing the photo — unless it's over
 * {@link FALLBACK_MAX_BYTES}, in which case this throws a user-readable Error.
 */
export async function downscaleToJpeg(file: Blob, options: DownscaleOptions = {}): Promise<Blob> {
  const maxEdge = options.maxEdge ?? DEFAULT_MAX_EDGE;
  const quality = options.quality ?? DEFAULT_JPEG_QUALITY;

  try {
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");
      if (!context) throw new Error("This browser can't process images.");
      context.drawImage(bitmap, 0, 0, width, height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality)
      );
      if (!blob) throw new Error("This browser can't process images.");
      return blob;
    } finally {
      bitmap.close();
    }
  } catch {
    const decision = decideDownscaleFallback(file.size);
    if (!decision.fallback) throw new Error(decision.reason);
    return file;
  }
}

/** Base64 (no data: prefix) of a Blob — what the Anthropic image block wants. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Couldn't read that file."));
    reader.readAsDataURL(blob);
  });
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}
