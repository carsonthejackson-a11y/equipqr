// Browser-only image helpers shared by every upload surface (request form,
// equipment photo, close-out photos, inspection photos, nameplate OCR).
// Phones hand us 12-megapixel HEIC/JPEG files; nothing we do needs more than
// ~1600px on the long edge, and Storage egress is what we pay for.

export const DEFAULT_MAX_EDGE = 1600;
export const DEFAULT_JPEG_QUALITY = 0.85;

export type DownscaleOptions = {
  maxEdge?: number;
  quality?: number;
};

/**
 * Downscales an image File/Blob to a JPEG no larger than `maxEdge` on its
 * long side. Throws a user-readable Error if the browser can't decode it.
 */
export async function downscaleToJpeg(file: Blob, options: DownscaleOptions = {}): Promise<Blob> {
  const maxEdge = options.maxEdge ?? DEFAULT_MAX_EDGE;
  const quality = options.quality ?? DEFAULT_JPEG_QUALITY;

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser couldn't process that image.");
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    if (!blob) throw new Error("Your browser couldn't process that image.");
    return blob;
  } finally {
    bitmap.close();
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
