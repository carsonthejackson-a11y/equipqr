"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { isoToZonedInputs } from "@/lib/scheduling";
import { scheduleVisit } from "../actions";
import { defaultVisitInputs, timezoneLabel } from "../visit-defaults";

const NOTE_MAX_LENGTH = 500;

export type ScheduleVisitDialogProps = {
  requestId: string;
  /** companies.timezone — the zone the date/time inputs are read in. */
  timezone: string;
  /** Existing visit, if any; pre-fills the inputs and switches copy to "reschedule". */
  scheduledFor: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Book or re-book a visit. Controlled like CancelRequestDialog so both the
 * Visit card and the StatusControl ("Scheduled" picked in the select) can
 * open it. The form lives in its own component inside DialogContent, which
 * base-ui unmounts when closed — so every open starts from fresh defaults.
 */
export function ScheduleVisitDialog({ requestId, timezone, scheduledFor, open, onOpenChange }: ScheduleVisitDialogProps) {
  const rescheduling = !!scheduledFor;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{rescheduling ? "Reschedule visit" : "Schedule a visit"}</DialogTitle>
          <DialogDescription>
            {rescheduling
              ? "Pick the new time. The request stays scheduled."
              : "Pick a time for the visit. The request moves to Scheduled."}
          </DialogDescription>
        </DialogHeader>
        <ScheduleVisitForm
          requestId={requestId}
          timezone={timezone}
          scheduledFor={scheduledFor}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ScheduleVisitForm({
  requestId,
  timezone,
  scheduledFor,
  onDone,
}: {
  requestId: string;
  timezone: string;
  scheduledFor: string | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [defaults] = useState(
    () => (scheduledFor && isoToZonedInputs(scheduledFor, timezone)) || defaultVisitInputs(timezone)
  );
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derive the zone's label at the default date so "Central Time" reads the
  // same whether the visit falls in standard or daylight time.
  const zoneLabel = timezoneLabel(timezone, new Date(`${defaults.date}T12:00:00Z`));

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setError(null);
    const result = await scheduleVisit(requestId, formData);
    setSubmitting(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    toast.success(scheduledFor ? "Visit rescheduled" : "Visit scheduled");
    onDone();
    router.refresh();
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="visit-date">Date</Label>
          <Input id="visit-date" name="date" type="date" defaultValue={defaults.date} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="visit-time">Time</Label>
          <Input id="visit-time" name="time" type="time" defaultValue={defaults.time} required />
        </div>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">Times are in {zoneLabel}.</p>
      <div className="space-y-2">
        <Label htmlFor="visit-note">Note for the customer (optional)</Label>
        <Textarea
          id="visit-note"
          name="note"
          rows={3}
          maxLength={NOTE_MAX_LENGTH}
          placeholder="e.g. Please make sure the unit is accessible"
        />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="visit-notify"
          name="notifyCustomer"
          checked={notifyCustomer}
          onCheckedChange={(checked) => setNotifyCustomer(checked === true)}
        />
        <Label htmlFor="visit-notify" className="font-normal">
          Notify customer by email
        </Label>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : scheduledFor ? "Reschedule" : "Schedule visit"}
        </Button>
      </DialogFooter>
    </form>
  );
}
