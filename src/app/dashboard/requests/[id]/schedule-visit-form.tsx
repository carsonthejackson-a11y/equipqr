"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Download, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDuration, formatZonedDateTime, utcIsoToZonedParts, zonedWallTimeToUtcIso } from "@/lib/schedule";
import { clearVisit, scheduleVisit } from "../schedule-actions";

const DURATION_OPTIONS: { value: string; label: string }[] = [
  { value: "30", label: "30 minutes" },
  { value: "60", label: "1 hour" },
  { value: "90", label: "1.5 hours" },
  { value: "120", label: "2 hours" },
  { value: "180", label: "3 hours" },
  { value: "240", label: "4 hours" },
];

/**
 * Set/clear the visit date + time for a request, and download a `.ics` for
 * whatever calendar app the technician uses. Company-timezone in, UTC
 * instant stored — the conversion happens client-side with `src/lib/schedule.ts`
 * so the `<input type="date">`/`<input type="time">` pair the tech fills in
 * always means "in our timezone", not the browser's. Rendered by the
 * `ScheduleVisitCard` server wrapper (./schedule-visit-card.tsx), which
 * fetches the company's timezone — keep this component itself receiving
 * plain props so it can stay a client component.
 */
export function ScheduleVisitForm({
  requestId,
  scheduledFor,
  durationMinutes,
  companyTimezone,
}: {
  requestId: string;
  scheduledFor: string | null;
  durationMinutes: number;
  companyTimezone: string;
}) {
  const router = useRouter();
  const existing = scheduledFor ? utcIsoToZonedParts(scheduledFor, companyTimezone) : null;
  const [date, setDate] = useState(existing?.date ?? "");
  const [time, setTime] = useState(existing?.time ?? "");
  const [duration, setDuration] = useState(String(durationMinutes || 60));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!date || !time) {
      setError("Pick a date and time");
      return;
    }
    setError(null);
    setSaving(true);
    const scheduledForIso = zonedWallTimeToUtcIso(date, time, companyTimezone);
    const result = await scheduleVisit(requestId, {
      scheduledFor: scheduledForIso,
      durationMinutes: Number(duration),
    });
    setSaving(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    toast.success("Visit scheduled");
    router.refresh();
  }

  async function handleClear() {
    setSaving(true);
    const result = await clearVisit(requestId);
    setSaving(false);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    setDate("");
    setTime("");
    toast.success("Visit removed");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="size-4" />
          Visit
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {scheduledFor && (
          <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
            <p className="font-medium">{formatZonedDateTime(scheduledFor, companyTimezone)}</p>
            <p className="text-xs text-muted-foreground">{formatDuration(durationMinutes)}</p>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="visit-date">Date</Label>
            <Input id="visit-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="visit-time">Time</Label>
            <Input id="visit-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="visit-duration">Duration</Label>
          <Select
            name="visit-duration"
            value={duration}
            onValueChange={(v) => setDuration(v ?? "60")}
            items={Object.fromEntries(DURATION_OPTIONS.map((o) => [o.value, o.label]))}
          >
            <SelectTrigger id="visit-duration" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DURATION_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="text-xs text-muted-foreground">Times are in your company&apos;s timezone ({companyTimezone}).</p>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : scheduledFor ? "Update visit" : "Schedule visit"}
          </Button>
          {scheduledFor && (
            <>
              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                render={
                  <a href={`/api/requests/${requestId}/ics`}>
                    <Download className="size-3.5" />
                    Add to calendar
                  </a>
                }
              />
              <Button type="button" size="sm" variant="ghost" onClick={handleClear} disabled={saving}>
                <X className="size-3.5" />
                Remove
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
