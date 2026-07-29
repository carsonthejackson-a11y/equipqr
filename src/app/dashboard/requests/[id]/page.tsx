import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { BackLink } from "@/components/back-link";
import type { Equipment, ServiceRequest, ServiceRequestMedia } from "@/lib/types";
import { StatusControl } from "./status-control";
import { CloseRequestDialog } from "./close-request-dialog";
import { MediaGallery } from "./media-gallery";

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

  const { data: equipment } = await supabase
    .from("equipment")
    .select("*")
    .eq("id", serviceRequest.equipment_id)
    .maybeSingle<Equipment>();

  const { data: media } = await supabase
    .from("service_request_media")
    .select("*")
    .eq("service_request_id", id)
    .returns<ServiceRequestMedia[]>();

  const mediaWithUrls = await Promise.all(
    (media ?? []).map(async (item) => {
      const { data: signed } = await supabase.storage
        .from("service-request-media")
        .createSignedUrl(item.storage_path, 3600);
      return { url: signed?.signedUrl ?? "", media_type: item.media_type };
    })
  );

  return (
    <div className="max-w-2xl space-y-6">
      <BackLink href="/dashboard/requests" label="Back to requests" />
      <div className="flex items-start justify-between gap-4">
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
        <div className="flex shrink-0 items-center gap-2">
          <StatusControl requestId={serviceRequest.id} status={serviceRequest.status} />
          <CloseRequestDialog request={serviceRequest} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Description</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap">{serviceRequest.description}</p>
        </CardContent>
      </Card>

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
          <CardTitle>Contact</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>{serviceRequest.contact_name}</p>
          {serviceRequest.contact_email && <p>{serviceRequest.contact_email}</p>}
          {serviceRequest.contact_phone && <p>{serviceRequest.contact_phone}</p>}
          {!serviceRequest.contact_email && !serviceRequest.contact_phone && (
            <p className="text-muted-foreground">No contact details provided</p>
          )}
        </CardContent>
      </Card>

      <Separator />
      {equipment && (
        <p className="text-sm text-muted-foreground">
          Serial: {equipment.serial_number ?? "—"} · Location: {equipment.location ?? "—"}
        </p>
      )}
    </div>
  );
}
