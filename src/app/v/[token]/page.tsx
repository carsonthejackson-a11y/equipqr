import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { MapPin, Phone, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIpFromHeaders, RATE_LIMITS } from "@/lib/rate-limit";
import { phoneHref } from "@/lib/branding";
import { formatZonedDateTime } from "@/lib/schedule";
import { DispatchStatusBadge } from "@/components/dispatch-status-badge";
import { REQUEST_PRIORITY_LABELS } from "@/components/status-badge";
import type { VendorDispatchView } from "@/lib/types";
import { VendorActionsPanel } from "./vendor-actions-panel";

// The no-login work-order page a vendor lands on from the dispatch email
// (docs/OWNER-ROADMAP-BRIEF.md §3.3.6). EquipQR-branded — this is not the
// owner's customer-facing surface, so it doesn't use BrandShell/ResolvedBranding.

export const dynamic = "force-dynamic";

function SlowDownPage() {
  return (
    <div className="mx-auto flex min-h-svh max-w-lg flex-col items-center justify-center gap-2 px-4 py-8 text-center">
      <h1 className="text-xl font-semibold">One moment</h1>
      <p className="text-muted-foreground">
        That&apos;s a lot of refreshing. Give it a minute and reload the page — this work order
        is safe.
      </p>
    </div>
  );
}

export default async function VendorDispatchPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Token guessing is impractical (192 bits), but the lookup is still an
  // unauthenticated DB round-trip anyone can drive.
  const headerList = await headers();
  const allowed = await checkRateLimit(
    `vp:ip:${getClientIpFromHeaders(headerList)}`,
    RATE_LIMITS.vendorActionPerIp
  );
  if (!allowed) return <SlowDownPage />;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_vendor_dispatch", { p_token: token });

  // P0002 (unknown token) and P0001 (declined / parent request closed) both
  // read as "this link is no longer active" to the vendor — there's nothing
  // actionable behind either, and the not-found route says so.
  if (error || !data) {
    notFound();
  }

  const view = data as VendorDispatchView;
  const { dispatch, vendor, owner, request, equipment, location, media, activity } = view;

  const makeModel = [equipment.make, equipment.model].filter(Boolean).join(" ");
  const photos = media.filter((m) => m.media_type === "image");

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-lg flex-col">
      <header className="border-b px-4 py-3">
        <p className="text-sm font-medium text-muted-foreground">Work order from {owner.company_name}</p>
      </header>

      <main className="flex flex-1 flex-col gap-5 px-4 pt-4 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl leading-tight font-semibold">{equipment.name}</h1>
            <p className="text-muted-foreground">{[makeModel, equipment.serial_number && `SN ${equipment.serial_number}`].filter(Boolean).join(" · ")}</p>
          </div>
          <span className="inline-flex shrink-0 items-center rounded-full border border-orange-500/20 bg-orange-500/15 px-3 py-1 text-sm font-semibold text-orange-700 dark:text-orange-400">
            {REQUEST_PRIORITY_LABELS[request.priority]}
          </span>
        </div>

        {equipment.in_warranty && (
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">In warranty</p>
        )}

        <DispatchStatusBadge
          status={dispatch.status}
          vendorName={vendor.name}
          etaAt={dispatch.eta_at}
          timeZone={owner.timezone}
        />

        {location && (
          <div className="space-y-1 rounded-xl border px-4 py-3 text-sm">
            <p className="flex items-center gap-1.5 font-medium">
              <MapPin className="size-4 shrink-0" aria-hidden />
              {location.name}
            </p>
            {location.address && (
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(location.address)}`}
                target="_blank"
                rel="noreferrer"
                className="block pl-6 text-primary hover:underline"
              >
                {location.address}
              </a>
            )}
            {location.hours && (
              <p className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="size-4 shrink-0" aria-hidden />
                {location.hours}
              </p>
            )}
          </div>
        )}

        <div className="space-y-1 rounded-xl border px-4 py-3 text-sm">
          <p className="font-medium">Ask for {request.contact_name}</p>
          {request.reporter_phone && (
            <a
              href={phoneHref("tel", request.reporter_phone)}
              className="flex items-center gap-1.5 text-primary hover:underline"
            >
              <Phone className="size-4 shrink-0" aria-hidden />
              {request.reporter_phone}
            </a>
          )}
          {vendor.account_number && (
            <p className="text-muted-foreground">Account #: {vendor.account_number}</p>
          )}
        </div>

        {request.symptoms.length > 0 && (
          <div className="space-y-1.5">
            <h2 className="font-semibold">Reported symptoms</h2>
            <ul className="flex flex-wrap gap-2">
              {request.symptoms.map((symptom, i) => (
                <li key={i} className="rounded-full border bg-muted/40 px-3 py-1 text-sm">
                  {symptom}
                </li>
              ))}
            </ul>
          </div>
        )}

        {request.description && (
          <div className="space-y-1.5">
            <h2 className="font-semibold">Description</h2>
            <p className="rounded-xl border px-4 py-3 text-sm whitespace-pre-wrap">{request.description}</p>
          </div>
        )}

        {photos.length > 0 && (
          <div className="space-y-1.5">
            <h2 className="font-semibold">Photos</h2>
            <div className="grid grid-cols-3 gap-2">
              {photos.map((photo) => (
                // Plain <img>: the src is this route's own redirecting media
                // endpoint, not a next/image remote pattern.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={photo.index}
                  src={`/v/${token}/media/${photo.index}`}
                  alt=""
                  className="aspect-square w-full rounded-lg border object-cover"
                />
              ))}
            </div>
          </div>
        )}

        <VendorActionsPanel
          token={token}
          vendorName={vendor.name}
          timeZone={owner.timezone}
          initialStatus={dispatch.status}
          initialEtaAt={dispatch.eta_at}
        />

        {activity.length > 0 && (
          <div className="space-y-2">
            <h2 className="font-semibold">Updates</h2>
            <ol className="space-y-2 border-l pl-4 text-sm">
              {activity.map((entry, i) => (
                <li key={i}>
                  {entry.body && <p>{entry.body}</p>}
                  <p className="text-xs text-muted-foreground">
                    {formatZonedDateTime(entry.created_at, owner.timezone)}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        )}
      </main>

      <footer className="mt-auto px-4 pt-8 pb-6 text-center text-xs text-muted-foreground">
        EquipQR sent you this because {owner.company_name} has you on file as the service vendor
        for this equipment.
      </footer>
    </div>
  );
}
