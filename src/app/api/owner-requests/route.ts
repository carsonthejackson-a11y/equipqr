import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { summarizeTroubleshootingPath } from "@/lib/anthropic";
import { buildVendorDispatchEmail } from "@/lib/email/vendor-dispatch";
import { buildOwnerNewRequestEmail, buildOwnerNoVendorEmail } from "@/lib/email/owner-notifications";
import { sendEmail } from "@/lib/email/send";
import { sanitizeEmailHeader } from "@/lib/email/layout";
import { enforceRateLimits, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { getRequestStatusUrl, getVendorDispatchUrl } from "@/lib/qr";
import { serverEnv } from "@/lib/env";
import { firstIssueMessage, ownerServiceRequestSchema, type OwnerServiceRequestInput } from "@/lib/public-request";
import { REQUEST_PRIORITY_LABELS } from "@/components/status-badge";
import type { OwnerSubmitResult } from "@/lib/types";

// The owner-kind sibling of POST /api/service-requests — the equipment_owner
// branch of the public scan flow. Rate limit, then validate, then create
// through the security-definer RPC that resolves the tenant server-side.
// Unlike the provider route, the reporter gave no email/phone we're required
// to have (a phone is optional), so there's no requester receipt — only the
// vendor (when one resolved) and the owner ever hear about this by email.

let warnedNoServiceRole = false;

/**
 * migration 0025 only returns dispatch_id/dispatch_token/vendor_email/
 * company_notification_email to the service role (is_service_role()), so the
 * admin client is what makes both the vendor dispatch email and the owner
 * notification possible. Without it the submission still succeeds — the
 * confirmation screen still gets vendor name/phone, since those ARE
 * anon-visible — it just can't email anyone.
 */
async function submitClient(): Promise<SupabaseClient> {
  try {
    return createAdminClient();
  } catch {
    if (!warnedNoServiceRole) {
      warnedNoServiceRole = true;
      console.warn(
        "SUPABASE_SERVICE_ROLE_KEY is not configured — vendor dispatch and owner notification emails for owner-kind requests will be skipped (dispatch_id/vendor_email/company_notification_email are only returned to the service role)."
      );
    }
    return createClient();
  }
}

function mapRpcError(error: { code?: string; message: string }): NextResponse {
  switch (error.code) {
    case "P0003":
      return NextResponse.json({ error: "This code belongs to a service company" }, { status: 400 });
    case "P0004":
      return NextResponse.json({ error: "A site code is required", needsPin: true }, { status: 403 });
    case "54000":
      return NextResponse.json(
        { error: "Too many requests — please wait a bit and try again." },
        { status: 429 }
      );
    default:
      return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const ip = getClientIp(request);
  const token = typeof raw?.qrToken === "string" ? raw.qrToken.slice(0, 200) : "unknown";

  const limited = await enforceRateLimits([
    { key: `osr:ip:${ip}`, rule: RATE_LIMITS.ownerRequestPerIp },
    { key: `osr:tok:${token}`, rule: RATE_LIMITS.ownerRequestPerToken },
  ]);
  if (limited) return limited;

  const parsed = ownerServiceRequestSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const body = parsed.data;

  // Honeypot: report success without touching the database so a bot doesn't
  // learn it was caught.
  if (body.website) {
    return NextResponse.json({ id: "", publicToken: "", statusUrl: "", vendor: null, dispatched: false });
  }

  const writer = await submitClient();
  // submit_owner_service_request() requires a non-empty p_description at the
  // DB layer even when the visitor only picked chips — see the schema's own
  // comment in src/lib/public-request.ts.
  const description = body.description.trim() || body.symptoms.join(", ");

  const { data, error } = await writer.rpc("submit_owner_service_request", {
    p_qr_token: body.qrToken,
    p_description: description,
    p_contact_name: body.contactName,
    p_reporter_phone: body.reporterPhone || null,
    p_symptoms: body.symptoms,
    p_priority: body.priority,
    p_media: body.media,
    p_pin_pass: body.pinPass || null,
  });

  if (error) {
    return mapRpcError(error);
  }

  const result = data as OwnerSubmitResult;
  const statusUrl = getRequestStatusUrl(result.public_token);

  const aiSummary = await summarizeTroubleshootingPath({
    equipmentName: result.equipment_name,
    description,
    path: body.symptoms.map((s) => ({ question: "Symptom", answer: s })),
  });

  if (aiSummary) {
    // Anon has no RLS update grant on service_requests — same reasoning as
    // the provider route: this goes through a security-definer RPC keyed on
    // id + the public token we were just handed.
    const supabase = await createClient();
    const { error: summaryError } = await supabase.rpc("set_request_ai_summary", {
      p_request_id: result.request_id,
      p_public_token: result.public_token,
      p_summary: aiSummary,
    });
    if (summaryError) {
      console.error("set_request_ai_summary failed:", summaryError.message);
    }
  }

  const priorityLabel = REQUEST_PRIORITY_LABELS[body.priority];

  if (result.dispatch_id && result.dispatch_token && result.vendor_email && result.vendor) {
    await sendVendorDispatchEmail(writer, result, body, description);
  }

  await sendOwnerNotificationEmail(result, body, description, priorityLabel);

  return NextResponse.json({
    id: result.request_id,
    publicToken: result.public_token,
    statusUrl,
    // vendor_email, dispatch_id and dispatch_token are never echoed here —
    // is_service_role()-gated at the RPC for a reason (see §7.2): the person
    // who just filed the report must never receive the token that acts as
    // the vendor.
    vendor: result.vendor ? { name: result.vendor.name, phone: result.vendor.phone } : null,
    dispatched: !!result.dispatch_id,
  });
}

type EquipmentExtra = {
  make: string | null;
  model: string | null;
  serial_number: string | null;
  warranty_ends_on: string | null;
  location_id: string | null;
};

/**
 * The vendor email needs make/model/serial/warranty/location-address/account
 * number — none of which submit_owner_service_request() returns (its result
 * is deliberately narrow, see §2.2.3). Best-effort: any lookup failure just
 * means that detail is left off the email, never a thrown error.
 */
async function sendVendorDispatchEmail(
  writer: SupabaseClient,
  result: OwnerSubmitResult,
  body: OwnerServiceRequestInput,
  description: string
): Promise<void> {
  const vendor = result.vendor;
  if (!vendor || !result.vendor_email || !result.dispatch_id || !result.dispatch_token) return;
  const dispatchId = result.dispatch_id;
  const dispatchToken = result.dispatch_token;
  const vendorEmail = result.vendor_email;

  try {
    const { data: equipment } = await writer
      .from("equipment")
      .select("make, model, serial_number, warranty_ends_on, location_id")
      .eq("id", result.equipment_id)
      .maybeSingle<EquipmentExtra>();

    let locationAddress: string | null = null;
    let locationHours: string | null = null;
    if (equipment?.location_id) {
      const { data: location } = await writer
        .from("locations")
        .select("address, hours")
        .eq("id", equipment.location_id)
        .maybeSingle<{ address: string | null; hours: string | null }>();
      locationAddress = location?.address ?? null;
      locationHours = location?.hours ?? null;
    }

    const { data: vendorExtra } = await writer
      .from("vendors")
      .select("account_number")
      .eq("id", vendor.id)
      .maybeSingle<{ account_number: string | null }>();

    const inWarranty = !!equipment?.warranty_ends_on && equipment.warranty_ends_on >= new Date().toISOString().slice(0, 10);

    const { subject, html, text } = buildVendorDispatchEmail({
      ownerName: result.company_name,
      equipmentName: result.equipment_name,
      make: equipment?.make ?? null,
      model: equipment?.model ?? null,
      serialNumber: equipment?.serial_number ?? null,
      inWarranty,
      locationName: result.location_name,
      locationAddress,
      locationHours,
      symptoms: body.symptoms,
      description,
      reporterName: body.contactName,
      reporterPhone: body.reporterPhone || null,
      accountNumber: vendorExtra?.account_number ?? null,
      photoCount: body.media.length,
      workOrderUrl: getVendorDispatchUrl(dispatchToken),
    });

    const replyTo = sanitizeEmailHeader(result.company_notification_email ?? "") ?? undefined;
    const sent = await sendEmail({ to: vendorEmail, subject, html, text, replyTo });

    await writer.rpc("mark_dispatch_sent", {
      p_dispatch_id: dispatchId,
      p_ok: sent,
      p_error: sent ? null : "sendEmail returned false",
    });
  } catch (err) {
    console.error("owner-requests: failed to send vendor dispatch email:", err);
    try {
      await writer.rpc("mark_dispatch_sent", {
        p_dispatch_id: dispatchId,
        p_ok: false,
        p_error: err instanceof Error ? err.message : "unknown error",
      });
    } catch (markErr) {
      console.error("owner-requests: mark_dispatch_sent also failed:", markErr);
    }
  }
}

async function sendOwnerNotificationEmail(
  result: OwnerSubmitResult,
  body: OwnerServiceRequestInput,
  description: string,
  priorityLabel: string
): Promise<void> {
  // Null when the RPC ran without the service-role key — see submitClient().
  if (!result.company_notification_email) return;

  try {
    if (result.dispatch_id && result.vendor) {
      const requestUrl = `${serverEnv.NEXT_PUBLIC_APP_URL}/dashboard/requests/${result.request_id}`;
      const { subject, html, text } = buildOwnerNewRequestEmail({
        equipmentName: result.equipment_name,
        locationName: result.location_name,
        reporterName: body.contactName,
        reporterPhone: body.reporterPhone || null,
        priorityLabel,
        symptoms: body.symptoms,
        description,
        vendorName: result.vendor.name,
        vendorPhone: result.vendor.phone,
        requestUrl,
      });
      await sendEmail({ to: result.company_notification_email, subject, html, text });
    } else {
      const equipmentUrl = `${serverEnv.NEXT_PUBLIC_APP_URL}/dashboard/equipment/${result.equipment_id}`;
      const { subject, html, text } = buildOwnerNoVendorEmail({
        equipmentName: result.equipment_name,
        locationName: result.location_name,
        reporterName: body.contactName,
        reporterPhone: body.reporterPhone || null,
        priorityLabel,
        symptoms: body.symptoms,
        description,
        equipmentUrl,
      });
      await sendEmail({ to: result.company_notification_email, subject, html, text });
    }
  } catch (err) {
    console.error("owner-requests: failed to send owner notification email:", err);
  }
}
