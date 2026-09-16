"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronDown,
  Images,
  Loader2,
  MapPin,
  MessageSquare,
  MessageSquarePlus,
  Navigation,
  Phone,
  UserPlus,
} from "lucide-react";
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
import { RelativeTime } from "@/components/relative-time";
import { phoneHref } from "@/lib/branding";
import { smsHref, telHref } from "@/lib/contact-links";
import { firstNameOf, formatOnMyWaySms } from "@/lib/staff-scan";
import { cn } from "@/lib/utils";
import type { CompanyKind, MediaKind, RequestStatus, ServiceRequest } from "@/lib/types";
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
  kind,
  companyName,
  technicianName,
  isLocked = false,
  media = [],
}: {
  qrToken: string;
  request: ServiceRequest;
  companyId: string;
  staffUserId: string;
  assigneeName: string | null;
  /** C1-03: owner-kind hides "On my way" (contact_email is always null on an owner-kind request, so the email path is permanently inert, and there's no vendor-style SMS story for it yet). */
  kind: CompanyKind;
  companyName: string;
  /** The signed-in technician's own name — for the "On my way" SMS fallback's "this is {tech}" line. */
  technicianName: string | null;
  /** C1-33: a locked company's staff can look, but every write action here is disabled. */
  isLocked?: boolean;
  /** Q-48: signed URLs for this request's media (customer-submitted or a prior staff close-out attempt), fetched server-side by StaffScanView. */
  media?: { url: string; caption: string | null; mediaType: MediaKind }[];
}) {
  const router = useRouter();
  const [noteOpen, setNoteOpen] = useState(false);
  const [etaOpen, setEtaOpen] = useState(false);
  const [closeOutOpen, setCloseOutOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [noteVisibleToCustomer, setNoteVisibleToCustomer] = useState(false);
  const [eta, setEta] = useState("30");
  const [busy, setBusy] = useState<string | null>(null);
  // Q-03/C1-31: what sendOnMyWay actually managed to do, once known — drives
  // whether the panel below shows "Send" or the SMS/Call fallback.
  const [onMyWayChannel, setOnMyWayChannel] = useState<"email" | "none" | null>(null);

  const isAssignedToMe = request.assigned_to === staffUserId;
  const isOwnerKind = kind === "equipment_owner";
  const hasDetails = media.length > 0 || !!request.ai_summary || request.troubleshooting_path.length > 0;

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
    setOnMyWayChannel(result.channel);
    if (result.channel === "email") {
      toast.success("Customer notified you're on the way");
      setEtaOpen(false);
    }
    // Left open on "none" so the SMS/Call fallback below has somewhere to
    // render — never claim a send that didn't happen (§1 rule 4).
    router.refresh();
  }

  function dismissOnMyWayFallback() {
    setEtaOpen(false);
    setOnMyWayChannel(null);
  }

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={request.status} />
        <PriorityBadge priority={request.priority} />
        <RelativeTime iso={request.created_at} className="text-xs text-muted-foreground" />
      </div>

      <p className="line-clamp-3 text-sm">{request.description}</p>

      {hasDetails && (
        <button
          type="button"
          onClick={() => setDetailsOpen((v) => !v)}
          aria-expanded={detailsOpen}
          className="flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-primary"
        >
          <Images className="size-4" aria-hidden />
          {media.length > 0 ? `Photos (${media.length})` : "AI summary"}
          <ChevronDown className={cn("size-4 transition-transform", detailsOpen && "rotate-180")} aria-hidden />
        </button>
      )}

      {detailsOpen && hasDetails && (
        <div className="space-y-3 rounded-lg border p-3 text-sm">
          {media.length > 0 && (
            <ul className="grid grid-cols-3 gap-2">
              {media.map((item, index) => (
                <li key={`${item.url}-${index}`}>
                  <a href={item.url} target="_blank" rel="noreferrer">
                    {/* Signed URL on the Supabase storage origin — not a next/image remote pattern. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.url}
                      alt={item.caption ?? "Request photo"}
                      className="aspect-square w-full rounded-lg border object-cover"
                    />
                  </a>
                </li>
              ))}
            </ul>
          )}
          {request.ai_summary && (
            <div>
              <p className="font-medium">AI summary</p>
              <p className="whitespace-pre-wrap text-muted-foreground">{request.ai_summary}</p>
            </div>
          )}
          {request.troubleshooting_path.length > 0 && (
            <div>
              <p className="font-medium">Troubleshooting path</p>
              <ol className="space-y-1 text-muted-foreground">
                {request.troubleshooting_path.map((entry, index) => (
                  <li key={index}>
                    {index + 1}. {entry.question} → <span className="text-foreground">{entry.answer}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

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
          On-my-way sent <RelativeTime iso={request.on_my_way_sent_at} />
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <select
          aria-label="Set status"
          value={QUICK_STATUSES.includes(request.status) ? request.status : ""}
          disabled={busy === "status" || isLocked}
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
            disabled={busy === "assign" || isLocked}
            onClick={handleAssignToMe}
            className="col-span-2 flex min-h-[56px] items-center justify-center gap-2 rounded-xl border text-base font-medium disabled:opacity-50"
          >
            {busy === "assign" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <UserPlus className="size-4" aria-hidden />}
            Assign to me
          </button>
        )}

        {/* C1-03: owner-kind requests never have a contact_email, so the
            email half of this is permanently inert, and there's no
            established "on my way" story for a vendorless owner repair yet —
            hidden rather than shown fibbing or as a dead click. */}
        {!isOwnerKind && (
          <button
            type="button"
            disabled={isLocked}
            onClick={() => setEtaOpen((v) => !v)}
            className="flex min-h-[56px] items-center justify-center gap-2 rounded-xl border text-base font-medium disabled:opacity-50"
          >
            <Navigation className="size-4" aria-hidden />
            On my way
          </button>
        )}
        <button
          type="button"
          disabled={isLocked}
          onClick={() => setNoteOpen((v) => !v)}
          className={cn(
            "flex min-h-[56px] items-center justify-center gap-2 rounded-xl border text-base font-medium disabled:opacity-50",
            isOwnerKind && "col-span-2"
          )}
        >
          <MessageSquarePlus className="size-4" aria-hidden />
          Add note
        </button>

        <button
          type="button"
          disabled={isLocked}
          onClick={() => setCloseOutOpen(true)}
          className="col-span-2 flex min-h-[56px] items-center justify-center rounded-xl border border-transparent bg-primary text-base font-semibold text-primary-foreground disabled:opacity-50"
        >
          Close out
        </button>
      </div>

      {etaOpen && !isOwnerKind && (
        <div aria-live="polite" className="rounded-lg border p-3">
          {onMyWayChannel === "none" ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                No email on file for {firstNameOf(request.contact_name, "the customer")} — text or call instead.
              </p>
              {request.contact_phone ? (
                <div className="flex gap-2">
                  <a
                    href={smsHref(
                      request.contact_phone,
                      formatOnMyWaySms(request.contact_name, technicianName ?? "", companyName)
                    )}
                    className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-lg border text-sm font-medium"
                  >
                    <MessageSquare className="size-4" aria-hidden />
                    Text
                  </a>
                  <a
                    href={telHref(request.contact_phone)}
                    className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-lg border text-sm font-medium"
                  >
                    <Phone className="size-4" aria-hidden />
                    Call
                  </a>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No phone on file either — logged internally only.</p>
              )}
              <button type="button" onClick={dismissOnMyWayFallback} className="text-xs text-muted-foreground underline underline-offset-2">
                Dismiss
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
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
            disabled={busy === "note" || !noteBody.trim() || isLocked}
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
