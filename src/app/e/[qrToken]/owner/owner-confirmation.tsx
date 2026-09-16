import { AlertTriangle, Check, Phone } from "lucide-react";
import { phoneHref } from "@/lib/branding";
import { requestReference } from "@/lib/public-request";
import { cn } from "@/lib/utils";

// The owner-kind confirmation screen (docs/OWNER-ROADMAP-BRIEF.md §3.3.2).
// Vendor email is never a prop here — it isn't anon-visible in the first
// place (see the comment in POST /api/owner-requests): only name and phone,
// which submit_owner_service_request() returns to anyone.
//
// Honesty (C1-30, Q-12): a vendor can resolve without a dispatch actually
// being created (no email on file for them), so "Sent to {vendor}" is only
// true when `dispatched` is. Likewise "{company} was notified" is only true
// when `ownerNotified` is — both come straight off what
// POST /api/owner-requests actually did, not just whether a vendor exists.

export function OwnerConfirmation({
  companyName,
  vendor,
  dispatched,
  ownerNotified,
  publicToken,
  statusUrl,
}: {
  companyName: string;
  vendor: { name: string; phone: string | null } | null;
  dispatched: boolean;
  ownerNotified: boolean;
  publicToken: string;
  statusUrl: string;
}) {
  const sentToVendor = dispatched && !!vendor;
  const failedToReachVendor = !dispatched && !!vendor;

  const heading = sentToVendor
    ? `Sent to ${vendor!.name}`
    : failedToReachVendor
      ? `We couldn't send this to ${vendor!.name} automatically`
      : "Report received";

  const subtext = sentToVendor
    ? ownerNotified
      ? `${companyName} was notified too.`
      : null
    : failedToReachVendor
      ? "Call them now to make sure they see it."
      : ownerNotified
        ? `No vendor is set for this unit yet — ${companyName} was notified instead.`
        : "No vendor is set for this unit yet.";

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <span
          className={cn(
            "flex size-14 items-center justify-center rounded-full",
            failedToReachVendor
              ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
              : "bg-[var(--brand)] text-[var(--brand-on)]"
          )}
        >
          {failedToReachVendor ? (
            <AlertTriangle className="size-7" aria-hidden />
          ) : (
            <Check className="size-7" aria-hidden />
          )}
        </span>
        <h1 className="text-xl font-semibold">{heading}</h1>
        {subtext && <p className="text-muted-foreground">{subtext}</p>}
      </div>

      {vendor?.phone && (
        <div
          className={cn(
            "space-y-2 rounded-xl border px-4 py-3",
            failedToReachVendor && "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40"
          )}
        >
          <a
            href={phoneHref("tel", vendor.phone)}
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 text-base font-semibold text-[var(--brand-on)]"
          >
            <Phone className="size-5" aria-hidden />
            Call {vendor.name} — {vendor.phone}
          </a>
          <p className="text-center text-xs text-muted-foreground">
            {failedToReachVendor
              ? "We couldn't reach them automatically — please call so this doesn't sit unseen."
              : "If this can't wait, call them. EquipQR sends the request; it can't confirm anyone picked it up."}
          </p>
        </div>
      )}

      {publicToken && (
        <div className="rounded-xl border px-4 py-3 text-center">
          <p className="text-sm text-muted-foreground">Your reference</p>
          <p className="font-mono text-lg font-semibold tracking-wider">
            {requestReference(publicToken)}
          </p>
        </div>
      )}

      {statusUrl && (
        <>
          <a
            href={statusUrl}
            className="flex min-h-[52px] w-full items-center justify-center rounded-xl border px-4 text-base font-semibold"
          >
            Track this request
          </a>
          <p className="text-center text-xs text-muted-foreground">
            Add this to your phone: {statusUrl}
          </p>
        </>
      )}
    </div>
  );
}
