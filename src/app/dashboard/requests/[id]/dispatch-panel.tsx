import { Phone, Mail, FileDown, Hash } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DispatchStatusBadge } from "@/components/dispatch-status-badge";
import { DISPATCH_STATUS_LABELS } from "@/lib/dispatch";
import { phoneHref } from "@/lib/branding";
import { formatZonedDateTime } from "@/lib/schedule";
import type { Company, CompanyKind, Dispatch, Profile, ServiceRequest, Vendor } from "@/lib/types";
import { DispatchAssignForm, ResendDispatchButton } from "./dispatch-panel-controls";

// Mounted by WS2's requests/[id]/page.tsx with exactly two props (frozen —
// docs/OWNER-ROADMAP-BRIEF.md §4.2):
//   {companyKind === "equipment_owner" && (
//     <DispatchPanel requestId={request.id} companyKind={companyKind} />
//   )}
// Renders nothing for a provider-kind request — the prop is passed straight
// through rather than assumed, so this component stays safe even if some
// future caller mounts it unconditionally.

export async function DispatchPanel({
  requestId,
  companyKind,
}: {
  requestId: string;
  companyKind: CompanyKind;
}) {
  if (companyKind !== "equipment_owner") return null;

  const supabase = await createClient();

  const [{ data: serviceRequest }, { data: profile }] = await Promise.all([
    supabase.from("service_requests").select("*").eq("id", requestId).maybeSingle<ServiceRequest>(),
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return { data: null };
      return supabase.from("profiles").select("*").eq("id", user.id).maybeSingle<Profile>();
    })(),
  ]);

  if (!serviceRequest) return null;

  const canManage = profile?.role === "owner" || profile?.role === "manager";

  if (!serviceRequest.dispatch_id) {
    const { data: vendors } = await supabase
      .from("vendors")
      .select("*")
      .eq("active", true)
      .order("name")
      .returns<Vendor[]>();

    return (
      <Card>
        <CardHeader>
          <CardTitle>Dispatch</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            No vendor has been dispatched for this work order yet.
          </p>
          {canManage ? (
            <DispatchAssignForm requestId={requestId} vendors={vendors ?? []} />
          ) : (
            <p className="text-muted-foreground">Only an owner or manager can dispatch to a vendor.</p>
          )}
        </CardContent>
      </Card>
    );
  }

  const { data: dispatch } = await supabase
    .from("dispatches")
    .select("*")
    .eq("id", serviceRequest.dispatch_id)
    .maybeSingle<Dispatch>();

  if (!dispatch) return null;

  const [{ data: vendor }, { data: company }] = await Promise.all([
    supabase.from("vendors").select("*").eq("id", dispatch.vendor_id).maybeSingle<Vendor>(),
    supabase.from("companies").select("*").eq("id", dispatch.company_id).maybeSingle<Company>(),
  ]);

  const invoiceUrl = dispatch.invoice_path
    ? (await supabase.storage.from("equipment-files").createSignedUrl(dispatch.invoice_path, 3600)).data
        ?.signedUrl ?? null
    : null;

  const timeZone = company?.timezone ?? "UTC";
  const timeline: { label: string; at: string | null }[] = [
    { label: DISPATCH_STATUS_LABELS.sent, at: dispatch.sent_at },
    { label: DISPATCH_STATUS_LABELS.viewed, at: dispatch.viewed_at },
    { label: DISPATCH_STATUS_LABELS.acknowledged, at: dispatch.acknowledged_at },
    { label: DISPATCH_STATUS_LABELS.finished, at: dispatch.finished_at },
    { label: DISPATCH_STATUS_LABELS.declined, at: dispatch.declined_at },
  ].filter((row) => row.at);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Dispatch</CardTitle>
        <DispatchStatusBadge
          status={dispatch.status}
          vendorName={vendor?.name}
          etaAt={dispatch.eta_at}
          timeZone={timeZone}
        />
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="space-y-1.5">
          <p className="font-medium">{vendor?.name ?? "Unknown vendor"}</p>
          {vendor?.phone && (
            <a href={phoneHref("tel", vendor.phone)} className="flex items-center gap-1.5 text-primary hover:underline">
              <Phone className="size-3.5" />
              {vendor.phone}
            </a>
          )}
          {vendor?.email && (
            <a href={`mailto:${vendor.email}`} className="flex items-center gap-1.5 text-primary hover:underline">
              <Mail className="size-3.5" />
              {vendor.email}
            </a>
          )}
          {vendor?.account_number && (
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <Hash className="size-3.5" />
              Account #: {vendor.account_number}
            </p>
          )}
        </div>

        {dispatch.eta_at && (
          <p>
            <span className="font-medium">ETA:</span> {formatZonedDateTime(dispatch.eta_at, timeZone)}
          </p>
        )}

        {dispatch.vendor_notes && (
          <div>
            <p className="font-medium">Vendor notes</p>
            <p className="whitespace-pre-wrap text-muted-foreground">{dispatch.vendor_notes}</p>
          </div>
        )}

        {dispatch.decline_reason && (
          <div>
            <p className="font-medium text-destructive">Decline reason</p>
            <p className="text-muted-foreground">{dispatch.decline_reason}</p>
          </div>
        )}

        {invoiceUrl && (
          // Plain <a>, not next/link: this is a signed Supabase storage URL,
          // not an in-app route — see the equivalent equipment-document link.
          <a
            href={invoiceUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-primary hover:underline"
          >
            <FileDown className="size-3.5" />
            Download invoice
          </a>
        )}

        {timeline.length > 0 && (
          <ol className="space-y-1 border-l pl-3 text-xs text-muted-foreground">
            {timeline.map((row) => (
              <li key={row.label}>
                {row.label} · {formatZonedDateTime(row.at as string, timeZone)}
              </li>
            ))}
          </ol>
        )}

        {canManage && vendor?.email && (
          <ResendDispatchButton requestId={requestId} disabled={dispatch.status === "declined"} />
        )}
        {canManage && !vendor?.email && (
          <p className="text-xs text-muted-foreground">This vendor has no email on file — add one to resend.</p>
        )}
      </CardContent>
    </Card>
  );
}
