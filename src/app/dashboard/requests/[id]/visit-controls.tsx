"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, CalendarX } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { OPEN_REQUEST_STATUSES } from "@/components/status-badge";
import type { RequestStatus } from "@/lib/types";
import { clearScheduledVisit } from "../actions";
import { ScheduleVisitDialog } from "./schedule-visit-dialog";

/** The Schedule / Reschedule / Clear buttons on the detail page's Visit card. */
export function VisitControls({
  requestId,
  timezone,
  scheduledFor,
  status,
}: {
  requestId: string;
  timezone: string;
  scheduledFor: string | null;
  status: RequestStatus;
}) {
  const router = useRouter();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

  const isOpen = (OPEN_REQUEST_STATUSES as string[]).includes(status);

  async function handleClear() {
    setClearing(true);
    setClearError(null);
    const result = await clearScheduledVisit(requestId);
    setClearing(false);

    if (result?.error) {
      setClearError(result.error);
      return;
    }

    toast.success("Visit cleared");
    setClearOpen(false);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      {isOpen && (
        <Button size="sm" variant={scheduledFor ? "outline" : "default"} onClick={() => setScheduleOpen(true)}>
          <CalendarPlus className="size-3.5" />
          {scheduledFor ? "Reschedule" : "Schedule visit"}
        </Button>
      )}
      {scheduledFor && (
        <Button size="sm" variant="ghost" onClick={() => setClearOpen(true)}>
          <CalendarX className="size-3.5" />
          Clear
        </Button>
      )}

      <ScheduleVisitDialog
        requestId={requestId}
        timezone={timezone}
        scheduledFor={scheduledFor}
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
      />

      <Dialog
        open={clearOpen}
        onOpenChange={(next) => {
          if (!next) setClearError(null);
          setClearOpen(next);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear this visit?</DialogTitle>
            <DialogDescription>
              {isOpen
                ? status === "scheduled"
                  ? "The request goes back to In progress and the customer is emailed that the visit was canceled."
                  : "The customer is emailed that the visit was canceled."
                : "The visit is removed from this closed request. The customer isn't notified."}
            </DialogDescription>
          </DialogHeader>
          {clearError && <p className="text-sm text-destructive">{clearError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearOpen(false)} disabled={clearing}>
              Keep visit
            </Button>
            <Button variant="destructive" onClick={handleClear} disabled={clearing}>
              {clearing ? "Clearing…" : "Clear visit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
