"use client";

import { useRef, useState } from "react";
import { Camera, Check, MessageSquarePlus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { downscaleToJpeg } from "@/lib/client-image";
import { applyItemValue } from "@/lib/checklists";
import { cn } from "@/lib/utils";
import type { InspectionItem } from "@/lib/types";

/** Every tappable control in this flow is at least this tall — one hand, standing at the machine. */
const TOUCH_TARGET = "min-h-14";

export function InspectionItemCard({
  item,
  companyId,
  inspectionId,
  onChange,
}: {
  item: InspectionItem;
  companyId: string;
  inspectionId: string;
  onChange: (next: InspectionItem) => void;
}) {
  const [noteOpen, setNoteOpen] = useState(!!item.response.note);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function setNote(note: string) {
    onChange({ ...item, response: { ...item.response, note: note || null } });
  }

  async function handlePhotoPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setPhotoError(null);
    setUploading(true);
    try {
      const blob = await downscaleToJpeg(file);
      const path = `${companyId}/inspections/${inspectionId}/${crypto.randomUUID()}.jpg`;
      const supabase = createClient();
      const { error } = await supabase.storage
        .from("equipment-files")
        .upload(path, blob, { contentType: "image/jpeg" });
      if (error) throw new Error(error.message);

      onChange({
        ...item,
        response: { ...item.response, photo_paths: [...item.response.photo_paths, path] },
      });
    } catch (cause) {
      setPhotoError(cause instanceof Error ? cause.message : "Couldn't upload that photo.");
    } finally {
      setUploading(false);
    }
  }

  function removePhoto(path: string) {
    onChange({
      ...item,
      response: { ...item.response, photo_paths: item.response.photo_paths.filter((p) => p !== path) },
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-medium leading-snug">{item.label}</p>
            {item.help && <p className="text-sm text-muted-foreground">{item.help}</p>}
          </div>
          {item.required && (
            <Badge variant="outline" className="shrink-0">
              Required
            </Badge>
          )}
        </div>

        {item.kind === "check" && (
          <button
            type="button"
            onClick={() => onChange(applyItemValue(item, item.response.value === true ? false : true))}
            className={cn(
              TOUCH_TARGET,
              "flex w-full items-center justify-center gap-2 rounded-xl border text-base font-medium transition-colors active:translate-y-px",
              item.response.value === true
                ? "border-emerald-600/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                : "bg-background hover:bg-muted"
            )}
          >
            <Check className="size-5" aria-hidden />
            {item.response.value === true ? "Checked" : "Tap to check"}
          </button>
        )}

        {item.kind === "pass_fail" && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onChange(applyItemValue(item, "pass"))}
              className={cn(
                TOUCH_TARGET,
                "rounded-xl border text-base font-medium transition-colors active:translate-y-px",
                item.response.value === "pass"
                  ? "border-emerald-600/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                  : "bg-background hover:bg-muted"
              )}
            >
              Pass
            </button>
            <button
              type="button"
              onClick={() => onChange(applyItemValue(item, "fail"))}
              className={cn(
                TOUCH_TARGET,
                "rounded-xl border text-base font-medium transition-colors active:translate-y-px",
                item.response.value === "fail"
                  ? "border-destructive/30 bg-destructive/15 text-destructive"
                  : "bg-background hover:bg-muted"
              )}
            >
              Fail
            </button>
          </div>
        )}

        {item.kind === "text" && (
          <Textarea
            rows={2}
            className="text-base"
            value={typeof item.response.value === "string" ? item.response.value : ""}
            onChange={(e) => onChange(applyItemValue(item, e.target.value))}
            placeholder="Type an observation…"
          />
        )}

        {item.kind === "number" && (
          <Input
            type="number"
            inputMode="decimal"
            className={cn(TOUCH_TARGET, "text-base")}
            value={typeof item.response.value === "number" ? item.response.value : ""}
            onChange={(e) => {
              const raw = e.target.value;
              onChange(applyItemValue(item, raw === "" ? null : Number(raw)));
            }}
            placeholder="Enter a reading…"
          />
        )}

        {item.kind === "photo" && (
          <div className="space-y-2">
            {photoError && <p className="text-sm text-destructive">{photoError}</p>}
            {item.response.photo_paths.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {item.response.photo_paths.map((path) => (
                  <div key={path} className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
                    <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
                      Photo added
                    </div>
                    <button
                      type="button"
                      onClick={() => removePhoto(path)}
                      aria-label="Remove photo"
                      className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-background/90 text-foreground shadow"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePhotoPick}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className={cn(
                TOUCH_TARGET,
                "flex w-full items-center justify-center gap-2 rounded-xl border bg-background text-base font-medium hover:bg-muted disabled:opacity-60"
              )}
            >
              <Camera className="size-5" aria-hidden />
              {uploading ? "Uploading…" : "Take a photo"}
            </button>
          </div>
        )}

        {noteOpen ? (
          <Textarea
            rows={2}
            className="text-sm"
            value={item.response.note ?? ""}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note (optional)"
            autoFocus
          />
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={() => setNoteOpen(true)}>
            <MessageSquarePlus className="size-4" />
            Add a note
          </Button>
        )}
        {noteOpen && !item.response.note && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setNoteOpen(false)}
          >
            <Trash2 className="size-3.5" />
            Cancel note
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
