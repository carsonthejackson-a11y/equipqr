import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildVendorDispatchEmail } from "@/lib/email/vendor-dispatch";
import { sendEmail } from "@/lib/email/send";
import { sanitizeEmailHeader } from "@/lib/email/layout";
import { getVendorDispatchUrl } from "@/lib/qr";
import { emitEquipmentEvent, emitRequestActivity } from "@/lib/events";
import type { Company, Equipment, Profile, ServiceRequest, Vendor } from "@/lib/types";

// Backs `dispatchToVendor()` in src/app/dashboard/requests/dispatch-actions.ts
// — a manual "assign a vendor" action for a request that has none (§9 Q10:
// no vendor resolved at submission, so no dispatch was auto-created).
//
// `dispatches` has NO insert policy — only the SECURITY DEFINER RPCs in
// migration 0025 write it (see that migration's comment on the table's RLS).
// No RPC exists for a *staff-initiated* dispatch, and WS3 may not add a
// migration, so this route is the smallest compliant shape available: the
// server action does its own auth/tenant checks with the caller's own
// RLS-scoped session (forwarded via cookies, verified again here with
// `auth.getUser()`), and only after every check passes does this ROUTE
// HANDLER — never the server action itself — reach for the admin client,
// exactly where docs/OWNER-ROADMAP-BRIEF.md §8's "admin client only in
// src/app/api/** route handlers" rule says it may live. See the WS3 report
// for why this couldn't instead be a normal RLS-scoped insert or an existing
// RPC.

export const runtime = "nodejs";

export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as
    | { requestId?: string; vendorId?: string }
    | null;
  const requestId = raw?.requestId;
  const vendorId = raw?.vendorId;
  if (!requestId || !vendorId) {
    return NextResponse.json({ error: "Missing requestId or vendorId" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Profile>();
  if (!profile || (profile.role !== "owner" && profile.role !== "manager")) {
    return NextResponse.json(
      { error: "Only owners and managers can dispatch to a vendor" },
      { status: 403 }
    );
  }

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("id", profile.company_id)
    .maybeSingle<Company>();
  if (!company || company.kind !== "equipment_owner") {
    return NextResponse.json({ error: "Not available for this company" }, { status: 400 });
  }

  // Every read below goes through the RLS-scoped client, so a request/vendor
  // id from another tenant simply resolves to null rather than needing an
  // explicit company_id check.
  const { data: serviceRequest } = await supabase
    .from("service_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle<ServiceRequest>();
  if (!serviceRequest) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  if (serviceRequest.dispatch_id) {
    return NextResponse.json({ error: "This request already has a dispatch" }, { status: 409 });
  }

  const { data: vendor } = await supabase
    .from("vendors")
    .select("*")
    .eq("id", vendorId)
    .maybeSingle<Vendor>();
  if (!vendor || !vendor.active) {
    return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
  }
  if (!vendor.email) {
    return NextResponse.json({ error: "This vendor has no email on file" }, { status: 400 });
  }

  const { data: equipment } = await supabase
    .from("equipment")
    .select("*")
    .eq("id", serviceRequest.equipment_id)
    .maybeSingle<Equipment>();

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: "This isn't configured yet — contact support." },
      { status: 500 }
    );
  }

  const { data: dispatch, error: insertError } = await admin
    .from("dispatches")
    .insert({
      company_id: company.id,
      service_request_id: requestId,
      vendor_id: vendorId,
      channel: "email",
      status: "sent",
    })
    .select("id, token")
    .single<{ id: string; token: string }>();

  if (insertError || !dispatch) {
    return NextResponse.json(
      { error: insertError?.message ?? "Couldn't create the dispatch" },
      { status: 500 }
    );
  }

  await emitRequestActivity(admin, {
    companyId: company.id,
    serviceRequestId: requestId,
    kind: "dispatch",
    visibility: "customer",
    body: `Sent to ${vendor.name}`,
    metadata: { action: "created", vendor_id: vendor.id, vendor_name: vendor.name, dispatch_id: dispatch.id },
    authorKind: "staff",
    authorUserId: user.id,
  });
  await emitEquipmentEvent(admin, {
    companyId: company.id,
    equipmentId: serviceRequest.equipment_id,
    kind: "dispatch_sent",
    summary: `Dispatched to ${vendor.name}`,
    details: { dispatch_id: dispatch.id, vendor_id: vendor.id },
    serviceRequestId: requestId,
    actorKind: "staff",
    actorUserId: user.id,
  });

  let locationName: string | null = null;
  let locationAddress: string | null = null;
  let locationHours: string | null = null;
  if (equipment?.location_id) {
    const { data: location } = await admin
      .from("locations")
      .select("name, address, hours")
      .eq("id", equipment.location_id)
      .maybeSingle<{ name: string; address: string | null; hours: string | null }>();
    locationName = location?.name ?? null;
    locationAddress = location?.address ?? null;
    locationHours = location?.hours ?? null;
  }

  const { count: photoCount } = await admin
    .from("service_request_media")
    .select("id", { count: "exact", head: true })
    .eq("service_request_id", requestId);

  const inWarranty =
    !!equipment?.warranty_ends_on && equipment.warranty_ends_on >= new Date().toISOString().slice(0, 10);
  const symptoms = (serviceRequest.troubleshooting_path ?? [])
    .filter((entry) => entry.question === "Symptom")
    .map((entry) => entry.answer);

  const { subject, html, text } = buildVendorDispatchEmail({
    ownerName: company.name,
    equipmentName: equipment?.name ?? "Equipment",
    make: equipment?.make ?? null,
    model: equipment?.model ?? null,
    serialNumber: equipment?.serial_number ?? null,
    inWarranty,
    locationName,
    locationAddress,
    locationHours,
    symptoms,
    description: serviceRequest.description,
    reporterName: serviceRequest.contact_name,
    reporterPhone: serviceRequest.reporter_phone,
    accountNumber: vendor.account_number,
    photoCount: photoCount ?? 0,
    workOrderUrl: getVendorDispatchUrl(dispatch.token),
  });

  const replyTo = sanitizeEmailHeader(company.notification_email) ?? undefined;
  const sent = await sendEmail({ to: vendor.email, subject, html, text, replyTo });

  await admin.rpc("mark_dispatch_sent", {
    p_dispatch_id: dispatch.id,
    p_ok: sent,
    p_error: sent ? null : "sendEmail returned false",
  });

  return NextResponse.json({ ok: true, dispatchId: dispatch.id });
}
