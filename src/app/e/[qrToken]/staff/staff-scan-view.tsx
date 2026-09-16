import Link from "next/link";
import { ClipboardList, FileText, Lock, MapPin, Navigation, Pencil, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatShortCode } from "@/lib/qr";
import { formatCompanyDate, formatRelativeTime, safeTimeZone } from "@/lib/format";
import { formatDateOnly } from "@/lib/schedule";
import { getEntitlements } from "@/lib/billing";
import { daysUntilDate } from "@/lib/equipment";
import { formatCustomFieldValue } from "@/lib/custom-fields";
import { resolveVisitContact } from "@/lib/staff-scan";
import { telHref, smsHref, mapsHref } from "@/lib/contact-links";
import { EquipmentStatusBadge, OPEN_REQUEST_STATUSES, StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import type {
  CompanyMember,
  Customer,
  Equipment,
  EquipmentCustomField,
  EquipmentDocument,
  EquipmentGuide,
  ServiceRequest,
  ServiceRequestMedia,
  UserRole,
} from "@/lib/types";
import { StaffRequestCard } from "./staff-request-card";
import { LogVisitCard } from "./log-visit-card";

// Workstream A (staff scan mode + close-out). A technician standing at the
// machine, on their phone: what's open on this unit, and a way to work and
// close out a request without going near the dashboard. Mobile-first, one
// action per screen, camera-first uploads — see NEXT-ROADMAP-BRIEF.md.

/** `fullName` mirrors the nullable `profiles.full_name` column — an invited technician may have none. */
export type ScanningStaff = { userId: string; role: UserRole; fullName: string | null };

const RECENT_HISTORY_LIMIT = 3;

export async function StaffScanView({
  guide,
  qrToken,
  staff,
}: {
  guide: EquipmentGuide;
  qrToken: string;
  staff: ScanningStaff;
}) {
  const supabase = await createClient();

  // Q-48/C1-13: everything below beyond the guide's own (public-safe)
  // fields is a separate RLS-authorized query, scoped to the signed-in
  // staff member's own company — never a widened public RPC (brief §1).
  const [
    { data: openRequests },
    { data: recentResolved, count: recentResolvedCount },
    { data: membersData },
    { data: equipmentRow },
    { data: documents },
    { data: customFieldDefs },
  ] = await Promise.all([
    supabase
      .from("service_requests")
      .select("*")
      .eq("equipment_id", guide.equipment.id)
      .in("status", OPEN_REQUEST_STATUSES)
      .order("created_at", { ascending: false })
      .returns<ServiceRequest[]>(),
    supabase
      .from("service_requests")
      .select("*", { count: "exact" })
      .eq("equipment_id", guide.equipment.id)
      .eq("status", "resolved")
      .order("resolved_at", { ascending: false })
      .limit(RECENT_HISTORY_LIMIT)
      .returns<ServiceRequest[]>(),
    supabase.rpc("get_company_members"),
    supabase.from("equipment").select("*").eq("id", guide.equipment.id).maybeSingle<Equipment>(),
    supabase
      .from("equipment_documents")
      .select("*")
      .eq("equipment_id", guide.equipment.id)
      .order("created_at", { ascending: false })
      .returns<EquipmentDocument[]>(),
    supabase
      .from("equipment_custom_fields")
      .select("*")
      .eq("company_id", guide.company.id)
      .order("sort_order")
      .returns<EquipmentCustomField[]>(),
  ]);

  const members = (membersData as CompanyMember[] | null) ?? [];
  const nameById = new Map(members.map((m) => [m.id, m.full_name?.trim() || m.email] as const));

  // Depend on the fetches above (customer_id, open request ids) so they run
  // in a second round trip rather than the first.
  const [{ data: customer }, { data: media }] = await Promise.all([
    equipmentRow?.customer_id
      ? supabase.from("customers").select("*").eq("id", equipmentRow.customer_id).maybeSingle<Customer>()
      : Promise.resolve({ data: null as Customer | null }),
    openRequests && openRequests.length > 0
      ? supabase
          .from("service_request_media")
          .select("*")
          .in(
            "service_request_id",
            openRequests.map((r) => r.id)
          )
          .returns<ServiceRequestMedia[]>()
      : Promise.resolve({ data: [] as ServiceRequestMedia[] }),
  ]);

  // Signed URLs (private bucket — see ../../dashboard/requests/[id]/page.tsx
  // for the same pattern), grouped back by request so each StaffRequestCard
  // only sees its own photos.
  const mediaByRequestId = new Map<string, { url: string; caption: string | null; mediaType: ServiceRequestMedia["media_type"] }[]>();
  for (const item of media ?? []) {
    const { data: signed } = await supabase.storage
      .from("service-request-media")
      .createSignedUrl(item.storage_path, 3600);
    if (!signed?.signedUrl) continue;
    const list = mediaByRequestId.get(item.service_request_id) ?? [];
    list.push({ url: signed.signedUrl, caption: item.caption, mediaType: item.media_type });
    mediaByRequestId.set(item.service_request_id, list);
  }

  // C1-33: entitlements are resolved from the SIGNED-IN staff member's own
  // session (RLS via get_my_company_id()), same call company-context.ts's
  // isLocked uses for /dashboard — mirrored by hand here rather than calling
  // getCompanyContext() itself, since that helper redirects on no session
  // and this route must stay reachable (fail-open) for anyone who scans.
  const entitlements = await getEntitlements();
  // `company.kind` is absent on guide payloads cached before migration 0024
  // (see CompanyPublicProfile) — default to service_provider like vocabFor()
  // already does, so every branch below (and StaffRequestCard's non-optional
  // `kind` prop) sees a real CompanyKind rather than undefined.
  const kind = guide.company.kind ?? "service_provider";
  const isLocked = entitlements ? kind !== "equipment_owner" && entitlements.is_locked : false;
  // C1-03 (scoped down per coordinator): only hide the two owner-kind dead
  // ends below (On my way / Start inspection) — no broader vocab swap here
  // while the owner side may be frozen.
  const isOwnerKind = kind === "equipment_owner";

  const staffFirstName = (staff.fullName ?? "").trim().split(/\s+/)[0] || "there";
  const companyTimeZone = safeTimeZone(guide.company.timezone);
  const makeModel = [guide.equipment.make, guide.equipment.model].filter(Boolean).join(" ");
  // next_service_due_on is a DATE column (no time/zone of its own) — format
  // with formatDateOnly so it reads the same everywhere regardless of server
  // or viewer timezone. last_serviced_at is a real timestamptz, so it needs
  // the company's own zone (Q-02-adjacent bug: this used to run both through
  // a bare toLocaleDateString(), which silently used the rendering server's
  // local zone instead).
  const nextServiceDue = guide.equipment.next_service_due_on
    ? formatDateOnly(guide.equipment.next_service_due_on)
    : null;
  const lastServiced = guide.equipment.last_serviced_at
    ? formatCompanyDate(guide.equipment.last_serviced_at, companyTimeZone)
    : null;

  // Warranty badges (QoL brief §2 shared default — deliberately NOT
  // equipment.ts's warrantyState()/WARRANTY_SOON_DAYS, which is the
  // dashboard's own 30-day threshold): a green "In warranty" or amber
  // "≤60 days" badge, or — once expired — no badge at all, just the neutral
  // "Warranty ended {date}" text a detail page uses.
  const WARRANTY_AMBER_DAYS = 60;
  const warrantyDays = equipmentRow ? daysUntilDate(equipmentRow.warranty_ends_on) : null;
  const warrantyBadge =
    warrantyDays === null || warrantyDays < 0
      ? null
      : warrantyDays <= WARRANTY_AMBER_DAYS
        ? {
            label: `Warranty: ${warrantyDays} day${warrantyDays === 1 ? "" : "s"} left`,
            className:
              "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
          }
        : {
            label: "In warranty",
            className:
              "border-green-300 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200",
          };
  const warrantyEndedText =
    warrantyDays !== null && warrantyDays < 0 && equipmentRow?.warranty_ends_on
      ? `Warranty ended ${formatDateOnly(equipmentRow.warranty_ends_on)}`
      : null;

  // Owner-defined fields with a value, in the owner's own sort order — every
  // field, not just the ones flagged show_on_scan_page (that flag is about
  // the PUBLIC customer page; staff get the full picture).
  const customFieldRows = (customFieldDefs ?? [])
    .map((def) => ({ label: def.label, value: formatCustomFieldValue(def, equipmentRow?.custom_fields?.[def.key]) }))
    .filter((f) => f.value !== "");

  // Site/contact block. Provider-kind: the equipment's own contact wins over
  // the linked customer's (resolveVisitContact — same fallback "Log a
  // visit" already uses), plus an address to route Directions from.
  // Owner-kind: just the location name already on the guide — no extra
  // query, no address/contact (brief: "no extra query" for this kind).
  const siteContact = !isOwnerKind && equipmentRow ? resolveVisitContact(equipmentRow, customer) : null;
  const siteName = customer?.name?.trim() || null;
  const siteAddress = equipmentRow?.address?.trim() || customer?.address?.trim() || null;
  const hasSiteBlock = !isOwnerKind && (siteName || siteAddress || siteContact?.contactPhone);
  const recentHistoryOpenByDefault = (recentResolvedCount ?? 0) <= RECENT_HISTORY_LIMIT;

  return (
    <div className="mx-auto flex min-h-svh max-w-lg flex-col gap-5 px-4 pb-10">
      <header className="flex items-center justify-between gap-3 border-b py-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
          Staff · {staffFirstName}
        </span>
        <Link href={`/e/${qrToken}?view=customer`} className="text-sm text-muted-foreground underline underline-offset-2">
          View customer page
        </Link>
      </header>

      {isLocked && (
        <Alert>
          <Lock aria-hidden />
          <AlertTitle>Your company&apos;s trial has ended</AlertTitle>
          <AlertDescription>
            You can still look around, but job actions here are turned off. Ask your account owner to
            choose a plan on the Billing page to keep going.
          </AlertDescription>
        </Alert>
      )}

      <section className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl leading-tight font-semibold">{guide.equipment.name}</h1>
            <p className="text-muted-foreground">
              {[guide.equipment_type.name, makeModel].filter(Boolean).join(" · ")}
            </p>
          </div>
          <EquipmentStatusBadge status={guide.equipment.status} />
        </div>

        {guide.equipment.location && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-4 shrink-0" aria-hidden />
            {guide.equipment.location}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>Last serviced {lastServiced ?? "—"}</span>
          <span>Next service due {nextServiceDue ?? "—"}</span>
          <span className="font-mono">{formatShortCode(guide.code.short_code)}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          {equipmentRow?.serial_number && (
            <span className="text-muted-foreground">Serial {equipmentRow.serial_number}</span>
          )}
          {warrantyBadge && (
            <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", warrantyBadge.className)}>
              {warrantyBadge.label}
            </span>
          )}
          {warrantyEndedText && <span className="text-muted-foreground">{warrantyEndedText}</span>}
        </div>

        {customFieldRows.length > 0 && (
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {customFieldRows.map((field) => (
              <div key={field.label} className="flex gap-1">
                <dt className="text-muted-foreground">{field.label}:</dt>
                <dd>{field.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {equipmentRow?.notes && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-medium">Notes for techs</p>
          <p className="whitespace-pre-wrap">{equipmentRow.notes}</p>
        </div>
      )}

      {hasSiteBlock && (
        <section className="space-y-1.5 rounded-xl border p-4">
          <h2 className="text-sm font-medium text-muted-foreground">Customer</h2>
          {siteName && <p className="font-medium">{siteName}</p>}
          {siteAddress && (
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              {siteAddress}
              <a href={mapsHref(siteAddress)} className="inline-flex items-center gap-1 text-primary underline underline-offset-2">
                <Navigation className="size-3.5" aria-hidden />
                Directions
              </a>
            </p>
          )}
          {siteContact && (siteContact.contactName || siteContact.contactPhone) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              {siteContact.contactName && <span>{siteContact.contactName}</span>}
              {siteContact.contactPhone && (
                <>
                  <a href={telHref(siteContact.contactPhone)} className="inline-flex items-center gap-1 text-primary">
                    <Phone className="size-3.5" aria-hidden />
                    Call
                  </a>
                  <a href={smsHref(siteContact.contactPhone)} className="inline-flex items-center gap-1 text-primary">
                    Text
                  </a>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {isOwnerKind && guide.location?.name && (
        <section className="space-y-1 rounded-xl border p-4">
          <h2 className="text-sm font-medium text-muted-foreground">Location</h2>
          <p className="font-medium">{guide.location.name}</p>
        </section>
      )}

      {documents && documents.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Manuals &amp; documents</h2>
          <ul className="space-y-1.5">
            {documents.map((doc) => (
              <li key={doc.id}>
                {/* A plain <a>, not <Link>: this route redirects to a signed
                    storage URL, which client-side navigation can't follow. */}
                <a
                  href={`/dashboard/equipment/${guide.equipment.id}/documents/${doc.id}`}
                  className="flex min-h-[44px] items-center gap-2 rounded-xl border px-3 text-sm font-medium"
                >
                  <FileText className="size-4 shrink-0" aria-hidden />
                  {doc.file_name}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Open requests</h2>
        {openRequests && openRequests.length > 0 && (
          <div className="space-y-3">
            {openRequests.map((request) => (
              <StaffRequestCard
                key={request.id}
                qrToken={qrToken}
                request={request}
                companyId={guide.company.id}
                staffUserId={staff.userId}
                assigneeName={request.assigned_to ? (nameById.get(request.assigned_to) ?? null) : null}
                kind={kind}
                companyName={guide.company.name}
                technicianName={staff.fullName}
                isLocked={isLocked}
                media={mediaByRequestId.get(request.id) ?? []}
              />
            ))}
          </div>
        )}
        {/* Always mounted (it hides itself while requests are open) so the
            close-out dialog it opens survives the refresh that follows
            "Log a visit" creating the request — see LogVisitCard. */}
        <LogVisitCard
          qrToken={qrToken}
          equipmentId={guide.equipment.id}
          companyId={guide.company.id}
          hasOpenRequests={!!openRequests && openRequests.length > 0}
          isLocked={isLocked}
        />
      </section>

      {recentResolved && recentResolved.length > 0 && (
        <details className="rounded-xl border" open={recentHistoryOpenByDefault}>
          <summary className="min-h-[56px] cursor-pointer list-none px-4 py-3 text-base font-medium marker:content-none">
            Recent history
          </summary>
          <div className="space-y-3 border-t px-4 py-3">
            {recentResolved.map((request) => (
              <div key={request.id} className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <StatusBadge status={request.status} />
                  <span className="text-muted-foreground">
                    {request.resolved_at ? formatRelativeTime(request.resolved_at) : ""}
                  </span>
                </div>
                {request.resolution_summary && (
                  <p className="line-clamp-2 text-muted-foreground">{request.resolution_summary}</p>
                )}
                <Link
                  href={`/dashboard/requests/${request.id}`}
                  className="inline-block text-primary underline underline-offset-2"
                >
                  View
                </Link>
              </div>
            ))}
          </div>
        </details>
      )}

      <section className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {/* C1-03: no vendorless "inspection" story for owner-kind yet — hidden
            rather than shown as a dead end. */}
        {!isOwnerKind &&
          (isLocked ? (
            <span
              aria-disabled="true"
              className="flex min-h-[56px] cursor-not-allowed items-center justify-center gap-2 rounded-xl border text-base font-medium text-muted-foreground opacity-50"
            >
              <ClipboardList className="size-4" aria-hidden />
              Start inspection
            </span>
          ) : (
            <Link
              href={`/e/${qrToken}/inspect`}
              className="flex min-h-[56px] items-center justify-center gap-2 rounded-xl border text-base font-medium"
            >
              <ClipboardList className="size-4" aria-hidden />
              Start inspection
            </Link>
          ))}
        <Link
          href={`/dashboard/equipment/${guide.equipment.id}`}
          className={cn(
            "flex min-h-[56px] items-center justify-center gap-2 rounded-xl border text-base font-medium",
            isOwnerKind && "sm:col-span-2"
          )}
        >
          <Pencil className="size-4" aria-hidden />
          Edit equipment
        </Link>
      </section>
    </div>
  );
}
