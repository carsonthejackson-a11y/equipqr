import { Check, Phone } from "lucide-react";
import { phoneHref } from "@/lib/branding";
import { requestReference } from "@/lib/public-request";

// The owner-kind confirmation screen (docs/OWNER-ROADMAP-BRIEF.md §3.3.2).
// Vendor email is never a prop here — it isn't anon-visible in the first
// place (see the comment in POST /api/owner-requests): only name and phone,
// which submit_owner_service_request() returns to anyone.

export function OwnerConfirmation({
  companyName,
  vendor,
  publicToken,
  statusUrl,
}: {
  companyName: string;
  vendor: { name: string; phone: string | null } | null;
  publicToken: string;
  statusUrl: string;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-[var(--brand)] text-[var(--brand-on)]">
          <Check className="size-7" aria-hidden />
        </span>
        <h1 className="text-xl font-semibold">
          Sent to {vendor ? vendor.name : companyName}
        </h1>
        <p className="text-muted-foreground">
          {vendor
            ? `${companyName} was notified too.`
            : "No vendor is set for this unit yet, so your manager was notified instead."}
        </p>
      </div>

      {vendor?.phone && (
        <div className="space-y-2 rounded-xl border px-4 py-3">
          <a
            href={phoneHref("tel", vendor.phone)}
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 text-base font-semibold text-[var(--brand-on)]"
          >
            <Phone className="size-5" aria-hidden />
            Call {vendor.name} — {vendor.phone}
          </a>
          <p className="text-center text-xs text-muted-foreground">
            If this can&apos;t wait, call them. EquipQR sends the request; it can&apos;t confirm
            anyone picked it up.
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
