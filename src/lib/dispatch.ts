// Vendor dispatch presentation helpers (docs/OWNER-ROADMAP-BRIEF.md §3.1.2).
// A dispatch is one request sent to a vendor for a service request
// (migration 0024's `dispatches` table) — these helpers turn its status/eta
// into copy the owner dashboard and vendor-facing email/page can share.

import type { DispatchStatus } from "@/lib/types";

export const DISPATCH_STATUS_LABELS: Record<DispatchStatus, string> = {
  pending_approval: "Waiting for approval",
  sent: "Sent to vendor",
  viewed: "Vendor opened it",
  acknowledged: "Vendor acknowledged",
  eta_given: "ETA given",
  finished: "Vendor marked finished",
  declined: "Vendor declined",
  failed: "Couldn't send",
};

/** Display order for a status filter/legend — mirrors the enum's own declaration order in migration 0024. */
export const DISPATCH_STATUS_ORDER: DispatchStatus[] = [
  "pending_approval",
  "sent",
  "viewed",
  "acknowledged",
  "eta_given",
  "finished",
  "declined",
  "failed",
];

/** Terminal for the vendor: declined | finished. Every other status still has at least one vendor action available. */
export function isVendorActionable(status: DispatchStatus): boolean {
  return status !== "declined" && status !== "finished";
}

/** "Tue 3:15 PM" style, in the given timezone (falls back to UTC when none is known). */
function formatEtaShort(iso: string, timeZone: string | null): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone ?? "UTC",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** "Metro Refrigeration · ETA Tue 3:15 PM" style one-liner for a list row. */
export function dispatchSummary(input: {
  status: DispatchStatus;
  vendorName: string | null;
  etaAt: string | null;
  timeZone: string | null;
}): string {
  const { status, vendorName, etaAt, timeZone } = input;
  const vendor = vendorName ?? "No vendor";
  if (status === "eta_given" && etaAt) {
    return `${vendor} · ETA ${formatEtaShort(etaAt, timeZone)}`;
  }
  return `${vendor} · ${DISPATCH_STATUS_LABELS[status]}`;
}

export type VendorAction = "acknowledge" | "eta" | "note" | "finish" | "decline" | "invoice";

export const VENDOR_ACTION_PAST_TENSE: Record<VendorAction, string> = {
  acknowledge: "acknowledged the work order",
  eta: "gave an ETA",
  note: "added a note",
  finish: "marked the work finished",
  decline: "declined the work order",
  invoice: "attached an invoice",
};
