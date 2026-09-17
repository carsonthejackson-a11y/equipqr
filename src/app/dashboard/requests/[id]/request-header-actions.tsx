"use client";

import { useState } from "react";
import { CloseRequestDialog, type CloseRequestExistingMedia } from "./close-request-dialog";
import { StatusControl } from "./status-control";
import { PriorityControl } from "./priority-control";
import { AssigneeControl } from "./assignee-control";
import { Button } from "@/components/ui/button";
import type { CompanyMember, ServiceRequest } from "@/lib/types";
import { CLOSED_REQUEST_STATUSES } from "@/components/status-badge";

/**
 * Wraps the request detail header's four controls together so picking
 * "Resolved" in StatusControl can open CloseRequestDialog (Q-14) instead of
 * transitioning straight away and leaving no summary — the two need shared
 * open state, which a server-rendered page.tsx can't hold itself. Since this
 * is also the one place assembling Priority/Status/Assigned side by side, it
 * owns the small visible label above each (Q-34) too — page.tsx can't wrap
 * them individually from outside a single opaque component.
 *
 * Also renders a sticky mobile-only bar pinned to the bottom of the screen
 * (Q-34/Q-35): the field-ready detail page is a long scroll on a phone, so
 * the primary "close it out" action stays thumb-reachable without scrolling
 * back to the header. It opens the SAME CloseRequestDialog instance/open
 * state as the inline trigger above (which keeps rendering on every
 * breakpoint) rather than mounting a second dialog, and only appears while
 * the request is still open — once it's resolved or canceled there's
 * nothing left to close out, so the bar disappears and the ordinary inline
 * "Edit close-out" trigger (unaffected by this) is all that's left.
 * page.tsx must leave matching bottom padding on its mobile content column
 * so this bar never covers the last card.
 */
export function RequestHeaderActions({
  request,
  members,
  existingMedia,
  closeLabel,
  editCloseLabel,
}: {
  request: ServiceRequest;
  members: CompanyMember[];
  existingMedia?: CloseRequestExistingMedia;
  /** Owner-kind "Mark fixed" instead of "Close out request" (C1-02/Q-60) — passed straight through to CloseRequestDialog's trigerLabel. */
  closeLabel?: string;
  /** Owner-kind equivalent of "Edit close-out". */
  editCloseLabel?: string;
}) {
  const [closeOpen, setCloseOpen] = useState(false);
  const isOpenRequest = !CLOSED_REQUEST_STATUSES.includes(request.status);

  return (
    <>
      <div className="flex flex-wrap items-start gap-4">
        <div role="group" aria-label="Priority" className="space-y-1">
          <span aria-hidden className="block text-xs font-medium text-muted-foreground">
            Priority
          </span>
          <PriorityControl requestId={request.id} priority={request.priority} />
        </div>
        <div role="group" aria-label="Status" className="space-y-1">
          <span aria-hidden className="block text-xs font-medium text-muted-foreground">
            Status
          </span>
          <StatusControl
            requestId={request.id}
            status={request.status}
            onResolveRequested={() => setCloseOpen(true)}
          />
        </div>
        <div role="group" aria-label="Assigned" className="space-y-1">
          <span aria-hidden className="block text-xs font-medium text-muted-foreground">
            Assigned
          </span>
          <AssigneeControl requestId={request.id} assignedTo={request.assigned_to} members={members} />
        </div>
        <div className="self-end">
          <CloseRequestDialog
            request={request}
            existingMedia={existingMedia}
            open={closeOpen}
            onOpenChange={setCloseOpen}
            triggerLabel={closeLabel}
            editTriggerLabel={editCloseLabel}
          />
        </div>
      </div>
      {isOpenRequest && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-2px_8px_rgba(0,0,0,0.06)] lg:hidden">
          <Button className="h-11 w-full text-base" onClick={() => setCloseOpen(true)}>
            {closeLabel ?? "Close out request"}
          </Button>
        </div>
      )}
    </>
  );
}
