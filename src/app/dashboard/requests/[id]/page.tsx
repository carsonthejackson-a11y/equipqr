import { notFound } from "next/navigation";
import Link from "next/link";
import { ExternalLink, Mail, MessageSquare, Navigation, Phone, Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCompanyContext } from "@/lib/company-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BackLink } from "@/components/back-link";
import { mapsHref, smsHref, telHref } from "@/lib/contact-links";
import { getRequestStatusUrl } from "@/lib/qr";
import { cn } from "@/lib/utils";
import type {
  CompanyMember,
  Customer,
  Equipment,
  Location,
  RequestActivity,
  ServiceRequest,
  ServiceRequestMedia,
} from "@/lib/types";
import { CLOSED_REQUEST_STATUSES, EquipmentStatusBadge } from "@/components/status-badge";
import { RequestHeaderActions } from "./request-header-actions";
import { MediaGallery } from "./media-gallery";
import { ActivityPanel } from "./activity-panel";
import { ScheduleVisitCard } from "./schedule-visit-card";
import { StatusLinkActions } from "./status-link-actions";
// WS2/WS3 frozen interface (docs/OWNER-ROADMAP-BRIEF.md §4.2) — mounted with
// exactly the two props below, nothing else in this file touches it.
import { DispatchPanel } from "./dispatch-panel";

export default async function ServiceRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const ctx = await getCompanyContext();
  const isOwnerKind = ctx.kind === "equipment_owner";

  const { data: serviceRequest } = await supabase
    .from("service_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle<ServiceRequest>();

  if (!serviceRequest) {
    notFound();
  }

  // Zero the unread customer-message counter as soon as staff open this
  // request. Deliberately an inline write before render rather than a
  // useEffect + server action round trip: this route already runs
  // server-side for every visit, RLS scopes the update to the caller's own
  // company, and a failed best-effort update just means the badge stays lit
  // a bit longer — nothing about the page itself depends on it succeeding.
  if (serviceRequest.unread_customer_messages > 0) {
    await supabase
      .from("service_requests")
      .update({ unread_customer_messages: 0 })
      .eq("id", serviceRequest.id);
    serviceRequest.unread_customer_messages = 0;
  }

  const [{ data: equipment }, { data: media }, { data: membersData }, { data: activity }, { data: customer }, { data: location }] =
    await Promise.all([
      supabase.from("equipment").select("*").eq("id", serviceRequest.equipment_id).maybeSingle<Equipment>(),
      supabase
        .from("service_request_media")
        .select("*")
        .eq("service_request_id", id)
        .returns<ServiceRequestMedia[]>(),
      supabase.rpc("get_company_members"),
      supabase
        .from("request_activity")
        .select("*")
        .eq("service_request_id", id)
        .order("created_at", { ascending: true })
        .returns<RequestActivity[]>(),
      !isOwnerKind && serviceRequest.customer_id
        ? supabase.from("customers").select("*").eq("id", serviceRequest.customer_id).maybeSingle<Customer>()
        : Promise.resolve({ data: null as Customer | null }),
      isOwnerKind && serviceRequest.location_id
        ? supabase.from("locations").select("*").eq("id", serviceRequest.location_id).maybeSingle<Location>()
        : Promise.resolve({ data: null as Location | null }),
    ]);
  const members = (membersData as CompanyMember[] | null) ?? [];

  const mediaWithUrls = await Promise.all(
    (media ?? []).map(async (item) => {
      const { data: signed } = await supabase.storage
        .from("service-request-media")
        .createSignedUrl(item.storage_path, 3600);
      return { url: signed?.signedUrl ?? "", media_type: item.media_type, origin: item.origin, caption: item.caption };
    })
  );

  // ---- Next roadmap (migration 0019 / workstream A) ----
  // Signature captured at phone close-out, signed the same way the media
  // above is.
  const signatureUrl = serviceRequest.signature_path
    ? (
        await supabase.storage.from("service-request-media").createSignedUrl(serviceRequest.signature_path, 3600)
      ).data?.signedUrl
    : null;
  const signature = signatureUrl
    ? { url: signatureUrl, signedByName: serviceRequest.signed_by_name, signedAt: serviceRequest.signed_at }
    : null;
  const staffPhotoUrls = mediaWithUrls
    .filter((m) => m.url && m.origin === "staff")
    .map((m) => ({ url: m.url, caption: m.caption }));

  const staffNameById = new Map(
    (members ?? []).map((m) => [m.id, m.full_name?.trim() || m.email] as const)
  );

  // C1-02: an owner-kind request's public submission form only ever collects
  // reporter_phone (see /api/owner-requests/route.ts) — contact_phone stays
  // null unless the request was logged from the dashboard (staff-request.ts).
  // Falling back keeps the Contact card and the quick-actions row from
  // wrongly claiming "no contact details" when there plainly is one.
  const contactPhone = serviceRequest.contact_phone ?? serviceRequest.reporter_phone;
  // Q-34 "site address": the customer's site for a service_provider company,
  // the linked Location for an equipment_owner one — falling back to the
  // equipment's own address/free-text location when neither is set.
  const siteAddress = isOwnerKind
    ? (location?.address ?? null)
    : (customer?.address ?? equipment?.address ?? equipment?.location ?? null);
  const statusUrl = getRequestStatusUrl(serviceRequest.public_token);
  const isOpenRequest = !CLOSED_REQUEST_STATUSES.includes(serviceRequest.status);
  const hasQuickActions = !!(contactPhone || siteAddress || equipment);

  return (
    <div className={cn("space-y-6", isOpenRequest && "pb-20 lg:pb-0")}>
      <BackLink href="/dashboard/requests" label="Back to requests" />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {equipment ? (
              <Link href={`/dashboard/equipment/${equipment.id}`} className="hover:underline">
                {equipment.name}
              </Link>
            ) : (
              "Unknown equipment"
            )}
          </h1>
          <p className="text-muted-foreground">Submitted {ctx.fmt.dateTime(serviceRequest.created_at)}</p>
        </div>
        <RequestHeaderActions
          request={serviceRequest}
          members={members}
          existingMedia={{ staffPhotos: staffPhotoUrls, signature }}
        />
      </div>

      {isOwnerKind && <DispatchPanel requestId={serviceRequest.id} companyKind={ctx.kind} />}

      {hasQuickActions && (
        <div className="grid grid-cols-2 gap-2 lg:hidden">
          {contactPhone && (
            <Button variant="outline" className="h-11 justify-start gap-2" render={<a href={telHref(contactPhone)} />}>
              <Phone className="size-4" />
              Call
            </Button>
          )}
          {contactPhone && (
            <Button variant="outline" className="h-11 justify-start gap-2" render={<a href={smsHref(contactPhone)} />}>
              <MessageSquare className="size-4" />
              Text
            </Button>
          )}
          {siteAddress && (
            <Button
              variant="outline"
              className="h-11 justify-start gap-2"
              render={<a href={mapsHref(siteAddress)} target="_blank" rel="noreferrer" />}
            >
              <Navigation className="size-4" />
              Directions
            </Button>
          )}
          {equipment && (
            <Button
              variant="outline"
              className="h-11 justify-start gap-2"
              nativeButton={false}
              render={<Link href={`/dashboard/equipment/${equipment.id}`} />}
            >
              <Wrench className="size-4" />
              Open unit
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap">{serviceRequest.description}</p>
            </CardContent>
          </Card>

          {serviceRequest.ai_summary && (
            <Card>
              <CardHeader>
                <CardTitle>AI summary</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap">{serviceRequest.ai_summary}</p>
              </CardContent>
            </Card>
          )}

          {serviceRequest.troubleshooting_path.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Troubleshooting path</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-1.5 text-sm">
                  {serviceRequest.troubleshooting_path.map((entry, index) => (
                    <li key={index}>
                      <span className="text-muted-foreground">
                        {index + 1}. {entry.question}
                      </span>{" "}
                      → <span className="font-medium">{entry.answer}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}

          {serviceRequest.resolution_summary && (
            <Card>
              <CardHeader>
                <CardTitle>Close-out summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="whitespace-pre-wrap">{serviceRequest.resolution_summary}</p>
                {serviceRequest.resolution_recommendations && (
                  <div>
                    <p className="font-medium">Recommendations</p>
                    <p className="whitespace-pre-wrap text-muted-foreground">
                      {serviceRequest.resolution_recommendations}
                    </p>
                  </div>
                )}
                <p className="text-muted-foreground">
                  {serviceRequest.resolved_at &&
                    `Closed ${ctx.fmt.dateTime(serviceRequest.resolved_at)}`}
                  {/* C1-02: no emailing claim at all when there's nothing to send it to. */}
                  {serviceRequest.contact_email &&
                    (serviceRequest.resolution_email_sent_at ? " · Emailed" : " · Not emailed")}
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Photos &amp; videos</CardTitle>
            </CardHeader>
            <CardContent>
              <MediaGallery items={mediaWithUrls.filter((m) => m.url)} signature={signature} timeZone={ctx.fmt.timeZone} />
            </CardContent>
          </Card>

          <ScheduleVisitCard request={serviceRequest} />

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityPanel
                items={activity ?? []}
                staffNameById={staffNameById}
                requestId={serviceRequest.id}
                hasContactEmail={!!serviceRequest.contact_email}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Equipment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              {equipment ? (
                <>
                  <Link
                    href={`/dashboard/equipment/${equipment.id}`}
                    className="font-medium hover:underline"
                  >
                    {equipment.name}
                  </Link>
                  <p className="text-muted-foreground">
                    {[equipment.make, equipment.model].filter(Boolean).join(" ") || "No make/model set"}
                  </p>
                  <p className="text-muted-foreground">Serial: {equipment.serial_number ?? "—"}</p>
                  <p className="text-muted-foreground">Location: {equipment.location ?? "—"}</p>
                  <EquipmentStatusBadge status={equipment.status} />
                </>
              ) : (
                <p className="text-muted-foreground">Unknown equipment</p>
              )}
            </CardContent>
          </Card>

          {/* C1-02: a work order has no "customer" — swap for the site it's at. */}
          {isOwnerKind ? (
            <Card>
              <CardHeader>
                <CardTitle>Location</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {location ? (
                  <>
                    <Link href={`/dashboard/locations/${location.id}`} className="font-medium hover:underline">
                      {location.name}
                    </Link>
                    {location.address && (
                      <a
                        href={mapsHref(location.address)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 text-primary hover:underline"
                      >
                        <Navigation className="size-3.5 shrink-0" />
                        {location.address}
                      </a>
                    )}
                    {location.phone && (
                      <a
                        href={telHref(location.phone)}
                        className="flex items-center gap-1.5 text-primary hover:underline"
                      >
                        <Phone className="size-3.5 shrink-0" />
                        {location.phone}
                      </a>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground">No location linked</p>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Customer</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {customer ? (
                  <Link href={`/dashboard/customers/${customer.id}`} className="font-medium hover:underline">
                    {customer.name}
                  </Link>
                ) : (
                  <p className="text-muted-foreground">No customer linked</p>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-medium">{serviceRequest.contact_name}</p>
              {contactPhone && (
                <a
                  href={telHref(contactPhone)}
                  className="flex items-center gap-1.5 text-primary hover:underline"
                >
                  <Phone className="size-3.5" />
                  {contactPhone}
                </a>
              )}
              {serviceRequest.contact_email && (
                <a
                  href={`mailto:${serviceRequest.contact_email}`}
                  className="flex items-center gap-1.5 text-primary hover:underline"
                >
                  <Mail className="size-3.5" />
                  {serviceRequest.contact_email}
                </a>
              )}
              {!serviceRequest.contact_email && !contactPhone && (
                <p className="text-muted-foreground">No contact details provided</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Public status page</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="mb-2 text-muted-foreground">
                  What the {ctx.vocab.reporterNoun.toLowerCase()} sees when they check on this request.
                </p>
                <a
                  href={statusUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-primary hover:underline"
                >
                  <ExternalLink className="size-3.5" />
                  Open track page
                </a>
              </div>
              <StatusLinkActions url={statusUrl} contactPhone={contactPhone} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
