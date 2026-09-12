import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildOwnerDispatchUpdateEmail } from "@/lib/email/owner-notifications";
import { sendEmail } from "@/lib/email/send";
import { enforceRateLimits, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { serverEnv } from "@/lib/env";
import { firstIssueMessage, vendorActionSchema, type VendorActionInput } from "@/lib/public-request";
import type { VendorAction } from "@/lib/dispatch";

// One route, one RPC per action, behind the no-login /v/<token> vendor page.
// Every RPC here resolves the dispatch from the token server-side (never a
// dispatch id from the client) and is safe to call with the anon key, but
// this route always uses the admin client so the notify payload's
// company_notification_email (is_service_role()-gated) comes back and the
// owner actually gets emailed.

type VendorNotifyPayload = {
  action: VendorAction;
  dispatch_id: string;
  status: string;
  request_id: string;
  request_public_token: string;
  vendor_id: string;
  vendor_name: string;
  eta_at: string | null;
  vendor_note: string | null;
  decline_reason: string | null;
  equipment_id: string;
  equipment_name: string;
  location_name: string | null;
  company_id: string;
  company_name: string;
  company_notification_email: string | null;
};

function mapRpcError(error: { code?: string; message: string }): NextResponse {
  switch (error.code) {
    case "P0002":
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    case "P0001":
      return NextResponse.json({ error: "This request is closed" }, { status: 409 });
    case "22023":
      return NextResponse.json({ error: error.message }, { status: 400 });
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
  const token = typeof raw?.token === "string" ? raw.token.slice(0, 200) : "unknown";

  const limited = await enforceRateLimits([
    { key: `va:ip:${ip}`, rule: RATE_LIMITS.vendorActionPerIp },
    { key: `va:tok:${token}`, rule: RATE_LIMITS.vendorActionPerToken },
  ]);
  if (limited) return limited;

  const parsed = vendorActionSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const body = parsed.data;

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: "This isn't configured yet — contact support." },
      { status: 500 }
    );
  }

  const { data, error } = await callVendorActionRpc(admin, body);
  if (error) {
    return mapRpcError(error);
  }

  const notify = data as VendorNotifyPayload;
  await sendOwnerDispatchUpdateEmail(admin, notify);

  return NextResponse.json({
    status: notify.status,
    action: notify.action,
    etaAt: notify.eta_at,
  });
}

async function callVendorActionRpc(admin: ReturnType<typeof createAdminClient>, body: VendorActionInput) {
  switch (body.action) {
    case "acknowledge":
      return admin.rpc("vendor_acknowledge_dispatch", { p_token: body.token, p_note: body.note ?? null });
    case "eta":
      return admin.rpc("vendor_set_dispatch_eta", {
        p_token: body.token,
        p_eta_at: body.etaAt,
        p_note: body.note ?? null,
      });
    case "note":
      return admin.rpc("vendor_add_dispatch_note", { p_token: body.token, p_body: body.body });
    case "finish":
      return admin.rpc("vendor_finish_dispatch", { p_token: body.token, p_note: body.note ?? null });
    case "decline":
      return admin.rpc("vendor_decline_dispatch", { p_token: body.token, p_reason: body.reason });
  }
}

async function sendOwnerDispatchUpdateEmail(
  admin: ReturnType<typeof createAdminClient>,
  notify: VendorNotifyPayload
): Promise<void> {
  if (!notify.company_notification_email) return;

  try {
    const { data: company } = await admin
      .from("companies")
      .select("timezone")
      .eq("id", notify.company_id)
      .maybeSingle<{ timezone: string }>();

    const { subject, html, text } = buildOwnerDispatchUpdateEmail({
      vendorName: notify.vendor_name,
      action: notify.action,
      equipmentName: notify.equipment_name,
      locationName: notify.location_name,
      note: notify.vendor_note,
      etaAt: notify.eta_at,
      timeZone: company?.timezone ?? "UTC",
      declineReason: notify.decline_reason,
      requestUrl: `${serverEnv.NEXT_PUBLIC_APP_URL}/dashboard/requests/${notify.request_id}`,
    });

    await sendEmail({ to: notify.company_notification_email, subject, html, text });
  } catch (err) {
    console.error("vendor-actions: failed to send owner dispatch-update email:", err);
  }
}
