"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { REQUEST_STATUS_LABELS, REQUEST_STATUS_ORDER } from "@/components/status-badge";
import type { RequestStatus } from "@/lib/types";
import { updateRequestStatus } from "../actions";
import { CancelRequestDialog } from "./cancel-request-dialog";

export function StatusControl({ requestId, status }: { requestId: string; status: RequestStatus }) {
  const [isPending, startTransition] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);

  function handleChange(value: RequestStatus | null) {
    if (!value || value === status) return;

    // Canceling needs a reason, so it goes through its own dialog instead of
    // firing straight away. Resolving is still allowed here (the DB trigger
    // stamps resolved_at either way) even though the close-out dialog is the
    // better path for leaving a summary.
    if (value === "canceled") {
      setCancelOpen(true);
      return;
    }

    startTransition(async () => {
      const result = await updateRequestStatus(requestId, value);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Status updated");
      }
    });
  }

  const items = Object.fromEntries(REQUEST_STATUS_ORDER.map((s) => [s, REQUEST_STATUS_LABELS[s]]));

  return (
    <>
      <Select value={status} onValueChange={handleChange} items={items} disabled={isPending}>
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {REQUEST_STATUS_ORDER.map((s) => (
            <SelectItem key={s} value={s}>
              {REQUEST_STATUS_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <CancelRequestDialog requestId={requestId} open={cancelOpen} onOpenChange={setCancelOpen} />
    </>
  );
}
