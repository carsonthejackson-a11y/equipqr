"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { formatBytes } from "@/lib/format";
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  ALLOWED_DOCUMENT_TYPES,
  MAX_DOCUMENT_BYTES,
  isAllowedDocumentType,
} from "@/lib/equipment";
import { addEquipmentDocument, deleteEquipmentDocument } from "../actions";

/** Storage object names have to survive a URL and a filesystem; the display name keeps the original. */
function safeObjectName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(0, 120) || "file";
}

export function DocumentUploader({
  equipmentId,
  companyId,
}: {
  equipmentId: string;
  companyId: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (file.size > MAX_DOCUMENT_BYTES) {
      setError(`${file.name} is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_DOCUMENT_BYTES)}.`);
      return;
    }
    if (!isAllowedDocumentType(file.type)) {
      setError(`${file.type} files aren't supported here.`);
      return;
    }

    setError(null);
    setBusy(true);
    try {
      const path = `${companyId}/equipment/${equipmentId}/${crypto.randomUUID()}-${safeObjectName(file.name)}`;

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("equipment-files")
        .upload(path, file, { contentType: file.type || "application/octet-stream" });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const result = await addEquipmentDocument({
        equipmentId,
        storagePath: path,
        fileName: file.name,
        mimeType: file.type || null,
        sizeBytes: file.size,
      });

      if (result?.error) {
        throw new Error(result.error);
      }

      toast.success(`Added ${file.name}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't upload that file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_DOCUMENT_MIME_TYPES.join(",")}
        className="hidden"
        onChange={handleFile}
      />
      <Button type="button" onClick={() => inputRef.current?.click()} disabled={busy}>
        <Upload className="size-4" />
        {busy ? "Uploading..." : "Upload document"}
      </Button>
      <p className="text-sm text-muted-foreground">
        {ALLOWED_DOCUMENT_TYPES.map((type) => type.label).join(", ")} — up to{" "}
        {formatBytes(MAX_DOCUMENT_BYTES)} each. Files are private to your company.
      </p>
    </div>
  );
}

export function DeleteDocumentButton({
  documentId,
  fileName,
}: {
  documentId: string;
  fileName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (!confirm(`Delete ${fileName}? This can't be undone.`)) return;
    setBusy(true);
    const result = await deleteEquipmentDocument(documentId);
    setBusy(false);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Deleted");
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleDelete}
      disabled={busy}
      aria-label={`Delete ${fileName}`}
    >
      <Trash2 className="size-4" />
      Delete
    </Button>
  );
}
