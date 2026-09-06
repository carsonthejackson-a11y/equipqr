import { NextResponse, after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimits, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { firstIssueMessage, requestUpdateSchema } from "@/lib/public-request";
import { buildCustomerMessageEmail } from "@/lib/email/customer-message";
import { sendEmail } from "@/lib/email/send";
import { serverEnv } from "@/lib/env";
import type { CustomerRequestUpdateResult } from "@/lib/types";

// The second anon write path (after /api/service-requests): a customer
// adding a note/message to a request they (or a co-worker) already
// submitted, identified by the unguessable public_token. Same order as the
// other public write route — rate limit, then validate, then the
// security-definer RPC — because add_customer_request_update() only returns
// the company's notification address and the assignee's email to the
// service role (migration 0019, same rule as 0018's submit_service_request).
//
// Needs the Node runtime for the service-role admin client.
export const runtime = "nodejs";

let warnedNoServiceRole = false;

/** Mirrors submitClient() in /api/service-requests: admin client when configured, RLS client (no staff emails) otherwise. */
async function writerClient(): Promise<SupabaseClient> {
  try {
    return createAdminClient();
  } catch {
    if (!warnedNoServiceRole) {
      warnedNoServiceRole = true;
      console.warn(
        "SUPABASE_SERVICE_ROLE_KEY is not configured — staff notification emails for customer messages will be skipped."
      );
    }
    return createClient();
  }
}

function statusForPgErrorCode(code: string | undefined): number {
  switch (code) {
    case "P0001": // request is resolved/canceled
      return 409;
    case "P0002": // unknown public_token
      return 404;
    case "22023": // body outside 2–2000 chars
      return 400;
    case "54000": // per-request ceiling inside the RPC (defence in depth)
      return 429;
    default:
      return 400;
  }
}

export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const ip = getClientIp(request);
  const token = typeof raw?.token === "string" ? raw.token.slice(0, 200) : "unknown";

  const limited = await enforceRateLimits([
    { key: `ru:ip:${ip}`, rule: RATE_LIMITS.customerUpdatePerIp },
    { key: `ru:tok:${token}`, rule: RATE_LIMITS.customerUpdatePerToken },
  ]);
  if (limited) return limited;

  const parsed = requestUpdateSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const body = parsed.data;

  // Honeypot: a real customer never fills this hidden field in. Report
  // success without writing anything so a bot gets no signal it was caught.
  if (body.website) {
    return NextResponse.json({ ok: true });
  }

  const writer = await writerClient();
  const { data, error } = await writer.rpc("add_customer_request_update", {
    p_public_token: body.token,
    p_body: body.body,
    p_author_name: body.authorName,
    p_contact_phone: body.contactPhone || null,
    p_contact_email: body.contactEmail || null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: statusForPgErrorCode(error.code) });
  }

  const result = data as CustomerRequestUpdateResult;

  // Never blocks the response the composer is waiting on — the message is
  // already safely recorded by this point, and the notification is
  // best-effort like every other staff email in this app.
  after(async () => {
    await sendStaffMessageNotification(result, body.body, body.authorName);
  });

  return NextResponse.json({ ok: true });
}

async function sendStaffMessageNotification(
  result: CustomerRequestUpdateResult,
  messageBody: string,
  authorName: string
) {
  // Both null when the RPC ran without the service-role key — see writerClient().
  const recipients = new Set<string>();
  if (result.company_notification_email) recipients.add(result.company_notification_email);
  if (result.assigned_to_email) recipients.add(result.assigned_to_email);
  if (recipients.size === 0) return;

  try {
    const dashboardUrl = `${serverEnv.NEXT_PUBLIC_APP_URL}/dashboard/requests/${result.request_id}`;
    const { subject, html, text } = buildCustomerMessageEmail({
      equipmentName: result.equipment_name,
      authorName,
      body: messageBody,
      dashboardUrl,
    });

    for (const to of recipients) {
      await sendEmail({ to, subject, html, text });
    }
  } catch (err) {
    console.error("customer message notification failed:", err);
  }
}
