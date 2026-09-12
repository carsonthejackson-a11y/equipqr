"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clearSitePin, setSitePin } from "../actions";

/**
 * Set / change / clear a location's site_pin (docs/OWNER-ROADMAP-BRIEF.md
 * §2.1.3). Shown in plain text to staff — it's a shared, printable poster
 * code, not a credential (see the migration's comment on the column). Never
 * sent anywhere but this authenticated page and the printed poster.
 */
export function SitePinCard({ locationId, sitePin }: { locationId: string; sitePin: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pin, setPin] = useState(sitePin ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await setSitePin(locationId, pin);
    setSaving(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    toast.success("Staff PIN saved");
    setEditing(false);
    router.refresh();
  }

  async function handleClear() {
    if (!confirm("Remove the staff PIN? Staff will no longer need a code to send a work order.")) return;
    setSaving(true);
    const result = await clearSitePin(locationId);
    setSaving(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    toast.success("Staff PIN removed");
    router.refresh();
  }

  async function copyPin() {
    if (!sitePin) return;
    try {
      await navigator.clipboard.writeText(sitePin);
      toast.success("PIN copied");
    } catch {
      toast.error("Couldn't copy — copy it from the field instead");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <KeyRound className="size-4" />
          Staff PIN
        </CardTitle>
        <CardDescription>
          An optional shared code staff enter before sending a work order from this location — a
          simple way to keep the scan report form off a public sticker&apos;s honor system. Not a
          password: print it on the staff poster.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {editing ? (
          <div className="flex items-center gap-2">
            <Input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 8))}
              placeholder="4–8 digits"
              className="max-w-40 font-mono"
              inputMode="numeric"
            />
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
          </div>
        ) : sitePin ? (
          <div className="flex flex-wrap items-center gap-2">
            <Label className="sr-only" htmlFor="site-pin-display">
              Staff PIN
            </Label>
            <Input id="site-pin-display" readOnly value={sitePin} className="max-w-40 font-mono text-lg" />
            <Button type="button" variant="outline" size="icon" onClick={copyPin}>
              <Copy />
              <span className="sr-only">Copy PIN</span>
            </Button>
            <Button type="button" variant="outline" onClick={() => setEditing(true)}>
              Change
            </Button>
            <Button type="button" variant="ghost" onClick={handleClear} disabled={saving}>
              Remove
            </Button>
          </div>
        ) : (
          <Button type="button" variant="outline" onClick={() => setEditing(true)}>
            Set a staff PIN
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
