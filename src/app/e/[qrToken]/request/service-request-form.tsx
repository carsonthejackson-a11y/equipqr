"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { X } from "lucide-react";

const MAX_FILES = 6;
const MAX_FILE_SIZE_MB = 25;

export function ServiceRequestForm({ qrToken }: { qrToken: string }) {
  const [description, setDescription] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  function handleFilesSelected(selected: FileList | null) {
    if (!selected) return;
    setError(null);

    const incoming = Array.from(selected);
    const tooBig = incoming.find((f) => f.size > MAX_FILE_SIZE_MB * 1024 * 1024);
    if (tooBig) {
      setError(`"${tooBig.name}" is larger than ${MAX_FILE_SIZE_MB}MB`);
      return;
    }

    setFiles((current) => {
      const next = [...current, ...incoming].slice(0, MAX_FILES);
      return next;
    });
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!description.trim()) {
      setError("Please describe the problem");
      return;
    }
    if (!contactName.trim()) {
      setError("Please enter your name");
      return;
    }

    setSubmitting(true);

    try {
      const supabase = createClient();
      const media: { storage_path: string; media_type: "image" | "video" }[] = [];

      for (const file of files) {
        const mediaType = file.type.startsWith("video/") ? "video" : "image";
        const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
        const path = `${qrToken}/${crypto.randomUUID()}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from("service-request-media")
          .upload(path, file, { contentType: file.type });

        if (uploadError) {
          throw new Error(`Failed to upload ${file.name}: ${uploadError.message}`);
        }

        media.push({ storage_path: path, media_type: mediaType });
      }

      const response = await fetch("/api/service-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qrToken,
          description,
          contactName,
          contactEmail,
          contactPhone,
          media,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Something went wrong submitting your request");
      }

      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Request sent</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Thanks — the service company has been notified and will reach out about your request.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="description">What&apos;s the problem?</Label>
        <Textarea
          id="description"
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what's happening..."
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="media">Photos or videos (optional)</Label>
        <Input
          id="media"
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={(e) => handleFilesSelected(e.target.files)}
        />
        {files.length > 0 && (
          <ul className="space-y-1">
            {files.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm"
              >
                <span className="truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="contactName">Your name</Label>
        <Input
          id="contactName"
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="contactEmail">Email</Label>
        <Input
          id="contactEmail"
          type="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="contactPhone">Phone</Label>
        <Input
          id="contactPhone"
          type="tel"
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
        />
      </div>

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? "Submitting..." : "Submit request"}
      </Button>
    </form>
  );
}
