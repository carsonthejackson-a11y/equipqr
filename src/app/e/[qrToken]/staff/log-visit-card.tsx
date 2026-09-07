"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Wrench } from "lucide-react";
import { createVisitRequest } from "../staff-actions";
import { CloseOutDialog } from "./close-out-dialog";

/**
 * Shown when a unit has no open request. Creates a `source: 'staff'` request
 * (see `createVisitRequest` for why) and walks straight into the same
 * close-out flow used to resolve any other request.
 *
 * The parent always mounts this, even while requests are open: creating the
 * visit request revalidates the scan page, and the refresh that follows
 * re-renders the staff view with the new request in the "Open requests"
 * list. If this card were only rendered in the empty state it would unmount
 * right then — taking the close-out dialog with it before the technician
 * had typed a word. Kept mounted, it hides its button and keeps the dialog.
 */
export function LogVisitCard({
  qrToken,
  equipmentId,
  companyId,
  hasOpenRequests = false,
}: {
  qrToken: string;
  equipmentId: string;
  companyId: string;
  /** True while the unit has open requests: the button is hidden, an in-progress close-out is not. */
  hasOpenRequests?: boolean;
}) {
  const [pending, setPending] = useState<{ requestId: string; contactEmail: string | null } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleStart() {
    setLoading(true);
    const result = await createVisitRequest(qrToken, equipmentId);
    setLoading(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setPending({ requestId: result.requestId, contactEmail: result.contactEmail });
    setDialogOpen(true);
  }

  if (hasOpenRequests && !pending) return null;

  return (
    <>
      {!hasOpenRequests && (
        <div className="space-y-3 rounded-xl border border-dashed p-4 text-center">
          <p className="text-sm text-muted-foreground">No open requests on this unit right now.</p>
          <button
            type="button"
            disabled={loading}
            onClick={handleStart}
            className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-xl border text-base font-medium disabled:opacity-50"
          >
            {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Wrench className="size-4" aria-hidden />}
            Log a visit
          </button>
        </div>
      )}

      {pending && (
        <CloseOutDialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            // Backing out leaves the request open in the list above, where its
            // own "Close out" button picks it up; nothing to keep here.
            if (!open) setPending(null);
          }}
          qrToken={qrToken}
          requestId={pending.requestId}
          companyId={companyId}
          defaultEmail={pending.contactEmail}
          onClosedOut={() => setPending(null)}
        />
      )}
    </>
  );
}
