"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, MapPin, MessageSquarePlus, Navigation, Phone, UserPlus } from "lucide-react";
import { updateRequestStatus, addRequestNote, assignRequest } from "@/app/dashboard/requests/actions";
import {
  REQUEST_STATUS_LABELS,
  REQUEST_STATUS_ORDER,
  PriorityBadge,
  StatusBadge,
} from "@/components/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { formatRelativeTime } from "@/lib/format";
import { phoneHref } from "@/lib/branding";
import type { RequestStatus, ServiceRequest } from "@/lib/types";
import { CloseOutDialog } from "./close-out-dialog";
import { sendOnMyWay } from "../staff-actions";

// The close-out flow handles moving a request to "resolved" (it also writes
// the summary/photos/signature), so the quick status picker below only
// offers the statuses a technician might set on the way *to* that point.
const QUICK_STATUSES: RequestStatus[] = REQUEST_STATUS_ORDER.filter(
  (status) => status !== "resolved" && status !== "canceled"
);

export function StaffRequestCard({
  qrToken,
  request,
  companyId,
  staffUserId,
  assigneeName,
}: {
  qrToken: string;
  request: ServiceRequest;
  companyId: string;
  staffUserId: string;
  assigneeName: string | null;
}) {
  const router = useRouter();
  const [noteOpen, setNoteOpen] = useState(false);
  const [etaOpen, setEtaOpen] = useState(false);
  const [closeOutOpen, setCloseOutOpen] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [noteVisibleToCustomer, setNoteVisibleToCustomer] = useState(false);
  const [eta, setEta] = useState("30");
  const [busy, setBusy] = useState<string | null>(null);

  const isAssignedToMe = request.assigned_to === staffUserId;

  async function handleStatusChange(status: RequestStatus) {
    setBusy("status");
    const result = await updateRequestStatus(request.id, status);
    setBusy(null);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`Status: ${REQUEST_STATUS_LABELS[status]}`);
    router.refresh();
  }

  async function handleAssignToMe() {
    setBusy("assign");
    const result = await assignRequest(request.id, staffUserId);
    setBusy(null);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Assigned to you");
    router.refresh();
  }

  async function handleSaveNote() {
    if (!noteBody.trim()) return;
    setBusy("note");
    const result = await addRequestNote(request.id, noteBody, noteVisibleToCustomer);
    setBusy(null);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Note added");
    setNoteBody("");
    setNoteOpen(false);
    router.refresh();
  }

  async function handleSendOnMyWay() {
    setBusy("eta");
    const result = await sendOnMyWay(qrToken, request.id, Number(eta));
    setBusy(null);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success("Customer notified you're on the way");
    setEtaOpen(false);
    router.refresh();
  }

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={request.status} />
        <PriorityBadge priority={request.priority} />
        <span className="text-xs text-muted-foreground">{formatRelativeTime(request.created_at)}</span>
      </div>

      <p className="line-clamp-3 text-sm">{request.description}</p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>{request.contact_name}</span>
        {request.contact_phone && (
          <a href={phoneHref("tel", request.contact_phone)} className="inline-flex items-center gap-1 text-primary">
            <Phone className="size-3.5" aria-hidden />
            {request.contact_phone}
          </a>
        )}
      </div>

      <p className="text-sm">
        {isAssignedToMe ? (
          <span className="font-medium">Assigned to you</span>
        ) : assigneeName ? (
          <span className="text-muted-foreground">Assigned to {assigneeName}</span>
        ) : (
          <span className="text-muted-foreground">Unassigned</span>
        )}
      </p>

      {request.on_my_way_sent_at && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="size-3.5" aria-hidden />
          On-my-way sent {formatRelativeTime(request.on_my_way_sent_at)}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <select
          aria-label="Set status"
          value={QUICK_STATUSES.includes(request.status) ? request.status : ""}
          disabled={busy === "status"}
          onChange={(e) => handleStatusChange(e.target.value as RequestStatus)}
          className="col-span-2 min-h-[56px] rounded-xl border bg-background px-3 text-base disabled:opacity-50"
        >
          {!QUICK_STATUSES.includes(request.status) && (
            <option value="" disabled>
              {REQUEST_STATUS_LABELS[request.status]}
            </option>
          )}
          {QUICK_STATUSES.map((status) => (
            <option key={status} value={status}>
              {REQUEST_STATUS_LABELS[status]}
            </option>
          ))}
        </select>

        {!isAssignedToMe && (
          <button
            type="button"
            disabled={busy === "assign"}
            onClick={handleAssignToMe}
            className="col-span-2 flex min-h-[56px] items-center justify-center gap-2 rounded-xl border text-base font-medium disabled:opacity-50"
          >
            {busy === "assign" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <UserPlus className="size-4" aria-hidden />}
            Assign to me
          </button>
        )}

        <button
          type="button"
          onClick={() => setEtaOpen((v) => !v)}
          className="flex min-h-[56px] items-center justify-center gap-2 rounded-xl border text-base font-medium"
        >
          <Navigation className="size-4" aria-hidden />
          On my way
        </button>
        <button
          type="button"
          onClick={() => setNoteOpen((v) => !v)}
          className="flex min-h-[56px] items-center justify-center gap-2 rounded-xl border text-base font-medium"
        >
          <MessageSquarePlus className="size-4" aria-hidden />
          Add note
        </button>

        <button
          type="button"
          onClick={() => setCloseOutOpen(true)}
          className="col-span-2 flex min-h-[56px] items-center justify-center rounded-xl border border-transparent bg-primary text-base font-semibold text-primary-foreground"
        >
          Close out
        </button>
      </div>

      {etaOpen && (
        <div className="flex items-center gap-2 rounded-lg border p-3">
          <Label htmlFor={`eta-${request.id}`} className="shrink-0 text-sm">
            ETA (min)
          </Label>
          <input
            id={`eta-${request.id}`}
            type="number"
            min={1}
            max={240}
            value={eta}
            onChange={(e) => setEta(e.target.value)}
            className="h-12 w-20 rounded-lg border bg-background px-2 text-base"
          />
          <button
            type="button"
            disabled={busy === "eta"}
            onClick={handleSendOnMyWay}
            className="ml-auto flex h-12 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy === "eta" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Send"}
          </button>
        </div>
      )}

      {noteOpen && (
        <div className="space-y-2 rounded-lg border p-3">
          <Textarea
            rows={3}
            className="text-base"
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            placeholder="What should the record show?"
          />
          <div className="flex items-center gap-2">
            <Checkbox
              id={`note-visible-${request.id}`}
              checked={noteVisibleToCustomer}
              onCheckedChange={(checked) => setNoteVisibleToCustomer(checked === true)}
            />
            <Label htmlFor={`note-visible-${request.id}`} className="font-normal">
              Visible to customer
            </Label>
          </div>
          <button
            type="button"
            disabled={busy === "note" || !noteBody.trim()}
            onClick={handleSaveNote}
            className="flex h-12 w-full items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy === "note" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Save note"}
          </button>
        </div>
      )}

      <Link
        href={`/dashboard/requests/${request.id}`}
        className="inline-block text-sm text-primary underline underline-offset-2"
      >
        View in dashboard
      </Link>

      <CloseOutDialog
        open={closeOutOpen}
        onOpenChange={setCloseOutOpen}
        qrToken={qrToken}
        requestId={request.id}
        companyId={companyId}
        defaultContactName={request.contact_name}
        defaultEmail={request.contact_email}
      />
    </div>
  );
}
