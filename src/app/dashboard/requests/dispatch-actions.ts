"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { emitRequestActivity } from "@/lib/events";
import { buildVendorDispatchEmail } from "@/lib/email/vendor-dispatch";
import { sendEmail } from "@/lib/email/send";
import { sanitizeEmailHeader } from "@/lib/email/layout";
import { getVendorDispatchUrl } from "@/lib/qr";
import { serverEnv } from "@/lib/env";
import type { Company, Dispatch, Equipment, Profile, ServiceRequest, Vendor } from "@/lib/types";

// Server actions behind DispatchPanel (docs/OWNER-ROADMAP-BRIEF.md §3.3).
// resendDispatch needs no admin client at all — every table it touches
// already has a staff SELECT/INSERT policy the caller's own RLS-scoped
// session satisfies. dispatchToVendor is different: `dispatches` has no
// insert policy (only the 0025 RPCs write it), and no RPC exists for a
// staff-initiated dispatch, so it proxies to a route handler that is
// allowed to hold the admin client — see src/app/api/dispatch-to-vendor/route.ts
// for the full reasoning, and the WS3 report for why this couldn't be
// avoided without a new migration.

async function requireOwnerOrManager(): Promise<
  { ok: true; profile: Profile } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Profile>();
  if (!profile || (profile.role !== "owner" && profile.role !== "manager")) {
    return { ok: false, error: "Only owners and managers can do this" };
  }
  return { ok: true, profile };
}

export async function resendDispatch(requestId: string): Promise<{ error?: string; success?: true }> {
  const guard = await requireOwnerOrManager();
  if (!guard.ok) return { error: guard.error };
  const { profile } = guard;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: serviceRequest } = await supabase
    .from("service_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle<ServiceRequest>();
  if (!serviceRequest || !serviceRequest.dispatch_id) {
    return { error: "This request has no dispatch to resend" };
  }

  const { data: dispatch } = await supabase
    .from("dispatches")
    .select("*")
    .eq("id", serviceRequest.dispatch_id)
    .maybeSingle<Dispatch>();
  if (!dispatch) return { error: "Dispatch not found" };

  const { data: vendor } = await supabase
    .from("vendors")
    .select("*")
    .eq("id", dispatch.vendor_id)
    .maybeSingle<Vendor>();
  if (!vendor?.email) return { error: "This vendor has no email on file" };

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("id", profile.company_id)
    .maybeSingle<Company>();
  if (!company) return { error: "Company not found" };

  const { data: equipment } = await supabase
    .from("equipment")
    .select("*")
    .eq("id", serviceRequest.equipment_id)
    .maybeSingle<Equipment>();

  let locationName: string | null = null;
  let locationAddress: string | null = null;
  let locationHours: string | null = null;
  if (equipment?.location_id) {
    const { data: location } = await supabase
      .from("locations")
      .select("name, address, hours")
      .eq("id", equipment.location_id)
      .maybeSingle<{ name: string; address: string | null; hours: string | null }>();
    locationName = location?.name ?? null;
    locationAddress = location?.address ?? null;
    locationHours = location?.hours ?? null;
  }

  const { count: photoCount } = await supabase
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

  await emitRequestActivity(supabase, {
    companyId: company.id,
    serviceRequestId: requestId,
    kind: "dispatch",
    visibility: "internal",
    body: sent ? `Resent to ${vendor.name}` : `Failed to resend to ${vendor.name}`,
    metadata: { action: "resent", vendor_id: vendor.id, vendor_name: vendor.name, dispatch_id: dispatch.id, ok: sent },
    authorKind: "staff",
    authorUserId: user?.id ?? null,
  });

  revalidatePath(`/dashboard/requests/${requestId}`);

  if (!sent) return { error: "Couldn't send the email — check the vendor's address and try again" };
  return { success: true };
}

export async function dispatchToVendor(
  requestId: string,
  vendorId: string
): Promise<{ error?: string; success?: true }> {
  const guard = await requireOwnerOrManager();
  if (!guard.ok) return { error: guard.error };

  // The privileged write happens in a route handler, never here — see the
  // module comment above and src/app/api/dispatch-to-vendor/route.ts. The
  // forwarded cookie header re-authenticates the same session there.
  const cookieHeader = (await cookies()).toString();

  let response: Response;
  try {
    response = await fetch(`${serverEnv.NEXT_PUBLIC_APP_URL}/api/dispatch-to-vendor`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({ requestId, vendorId }),
      cache: "no-store",
    });
  } catch (err) {
    console.error("dispatchToVendor: request to /api/dispatch-to-vendor failed:", err);
    return { error: "Something went wrong — try again" };
  }

  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    return { error: data.error ?? "Something went wrong" };
  }

  revalidatePath(`/dashboard/requests/${requestId}`);
  return { success: true };
}
