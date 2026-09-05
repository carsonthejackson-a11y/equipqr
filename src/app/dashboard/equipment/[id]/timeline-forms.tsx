"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageSquarePlus, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAX_NOTE_LENGTH } from "@/lib/equipment";
import { addEquipmentNote, logEquipmentService } from "../actions";

/** Today in the browser's own timezone, as the value a <input type="date"> wants. */
function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

export function TimelineForms({ equipmentId }: { equipmentId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"none" | "note" | "service">("none");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const noteFormRef = useRef<HTMLFormElement>(null);
  const serviceFormRef = useRef<HTMLFormElement>(null);

  function open(next: "note" | "service") {
    setError(null);
    setMode((current) => (current === next ? "none" : next));
  }

  async function handleNote(formData: FormData) {
    setError(null);
    setSaving(true);
    const result = await addEquipmentNote(equipmentId, formData);
    setSaving(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    noteFormRef.current?.reset();
    setMode("none");
    toast.success("Note added");
    router.refresh();
  }

  async function handleService(formData: FormData) {
    setError(null);
    setSaving(true);
    const result = await logEquipmentService(equipmentId, formData);
    setSaving(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    serviceFormRef.current?.reset();
    setMode("none");
    toast.success("Service logged");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={mode === "note" ? "secondary" : "outline"}
          onClick={() => open("note")}
        >
          <MessageSquarePlus className="size-4" />
          Add note
        </Button>
        <Button
          type="button"
          variant={mode === "service" ? "secondary" : "outline"}
          onClick={() => open("service")}
        >
          <Wrench className="size-4" />
          Log service
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {mode === "note" && (
        <form ref={noteFormRef} action={handleNote} className="space-y-2 rounded-lg border p-3">
          <Label htmlFor="note">Note</Label>
          <Textarea
            id="note"
            name="note"
            rows={3}
            required
            maxLength={MAX_NOTE_LENGTH}
            placeholder="What should the next tech know?"
          />
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Add note"}
          </Button>
        </form>
      )}

      {mode === "service" && (
        <form
          ref={serviceFormRef}
          action={handleService}
          className="space-y-3 rounded-lg border p-3"
        >
          <div className="space-y-2">
            <Label htmlFor="servicedOn">Date serviced</Label>
            <Input
              id="servicedOn"
              name="servicedOn"
              type="date"
              required
              defaultValue={todayIso()}
              className="sm:w-48"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="summary">What was done</Label>
            <Textarea
              id="summary"
              name="summary"
              rows={3}
              required
              maxLength={MAX_NOTE_LENGTH}
              placeholder="e.g. Annual service — flushed tank, replaced anode rod."
            />
          </div>
          <p className="text-sm text-muted-foreground">
            This also moves the unit&apos;s &ldquo;last serviced&rdquo; date forward.
          </p>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Log service"}
          </Button>
        </form>
      )}
    </div>
  );
}
