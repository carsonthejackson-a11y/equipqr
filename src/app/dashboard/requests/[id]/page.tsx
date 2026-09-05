import { notFound } from "next/navigation";
import Link from "next/link";
import { ExternalLink, Mail, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { BackLink } from "@/components/back-link";
import { phoneHref } from "@/lib/branding";
import { getRequestStatusUrl } from "@/lib/qr";
import type {
  CompanyMember,
  Customer,
  Equipment,
  RequestActivity,
  ServiceRequest,
  ServiceRequestMedia,
} from "@/lib/types";
import { EquipmentStatusBadge } from "@/components/status-badge";
import { StatusControl } from "./status-control";
import { PriorityControl } from "./priority-control";
import { AssigneeControl } from "./assignee-control";
import { CloseRequestDialog } from "./close-request-dialog";
import { MediaGallery } from "./media-gallery";
import { ActivityFeed } from "./activity-feed";
import { AddNoteForm } from "./add-note-form";

export default async function ServiceRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: serviceRequest } = await supabase
    .from("service_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle<ServiceRequest>();

  if (!serviceRequest) {
    notFound();
  }

  const [{ data: equipment }, { data: media }, { data: membersData }, { data: activity }, { data: customer }] =
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
      serviceRequest.customer_id
        ? supabase.from("customers").select("*").eq("id", serviceRequest.customer_id).maybeSingle<Customer>()
        : Promise.resolve({ data: null as Customer | null }),
    ]);
  const members = (membersData as CompanyMember[] | null) ?? [];

  const mediaWithUrls = await Promise.all(
    (media ?? []).map(async (item) => {
      const { data: signed } = await supabase.storage
        .from("service-request-media")
        .createSignedUrl(item.storage_path, 3600);
      return { url: signed?.signedUrl ?? "", media_type: item.media_type };
    })
  );

  const staffNameById = new Map(
    (members ?? []).map((m) => [m.id, m.full_name?.trim() || m.email] as const)
  );

  return (
    <div className="space-y-6">
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
          <p className="text-muted-foreground">
            Submitted {new Date(serviceRequest.created_at).toLocaleString()}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PriorityControl requestId={serviceRequest.id} priority={serviceRequest.priority} />
          <StatusControl requestId={serviceRequest.id} status={serviceRequest.status} />
          <AssigneeControl
            requestId={serviceRequest.id}
            assignedTo={serviceRequest.assigned_to}
            members={members ?? []}
          />
          <CloseRequestDialog request={serviceRequest} />
        </div>
      </div>

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
                    `Closed ${new Date(serviceRequest.resolved_at).toLocaleString()}`}
                  {serviceRequest.resolution_email_sent_at
                    ? " · Emailed to customer"
                    : " · Not emailed to customer"}
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Photos &amp; videos</CardTitle>
            </CardHeader>
            <CardContent>
              <MediaGallery items={mediaWithUrls.filter((m) => m.url)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ActivityFeed items={activity ?? []} staffNameById={staffNameById} />
              <Separator />
              <AddNoteForm requestId={serviceRequest.id} />
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

          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-medium">{serviceRequest.contact_name}</p>
              {serviceRequest.contact_phone && (
                <a
                  href={phoneHref("tel", serviceRequest.contact_phone)}
                  className="flex items-center gap-1.5 text-primary hover:underline"
                >
                  <Phone className="size-3.5" />
                  {serviceRequest.contact_phone}
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
              {!serviceRequest.contact_email && !serviceRequest.contact_phone && (
                <p className="text-muted-foreground">No contact details provided</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Public status page</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <p className="mb-2 text-muted-foreground">What the customer sees when they check on this request.</p>
              <a
                href={getRequestStatusUrl(serviceRequest.public_token)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-primary hover:underline"
              >
                <ExternalLink className="size-3.5" />
                Open track page
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
