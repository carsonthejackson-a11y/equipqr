import { NextResponse, after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildCustomerMessageEmail } from "@/lib/email/customer-message";
import { sendEmail } from "@/lib/email/send";
import { enforceRateLimits, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { serverEnv } from "@/lib/env";
import { customerMessageSchema } from "@/lib/customer-message";
import { firstIssueMessage } from "@/lib/public-request";
import type { CustomerMessageResult } from "@/lib/types";

// The customer's reply box on /r/<token>. Same shape as the service-request
// submit route, and the same order: rate limit before any parsing or DB
// work, then validate, then write through the security-definer RPC that
// resolves the request from its unguessable public token. The response
// never echoes anything the RPC returned about the company — the browser
// only learns that the message landed.

// The assignee lookup uses the auth admin API, which needs Node.
export const runtime = "nodejs";

/** Once per server process, not once per message. */
let warnedNoServiceRole = false;

/**
 * The client that runs `add_request_customer_message`. The RPC only returns
 * the company's internal `notification_email` to the service role, so the
 * admin client is what makes the staff notification possible; without a
 * service-role key the message is still recorded — staff just don't get
 * told, which we say out loud once. Returns the admin client separately so
 * the assignee lookup (auth admin API) knows whether it has one.
 */
async function messageClient(): Promise<{ writer: SupabaseClient; admin: SupabaseClient | null }> {
  try {
    const admin = createAdminClient();
    return { writer: admin, admin };
  } catch {
    if (!warnedNoServiceRole) {
      warnedNoServiceRole = true;
      console.warn(
        "SUPABASE_SERVICE_ROLE_KEY is not configured — staff notification emails for customer replies will be skipped (the company's notification address is only returned to the service role)."
      );
    }
    return { writer: await createClient(), admin: null };
  }
}

export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const ip = getClientIp(request);
  const token = typeof raw?.token === "string" ? raw.token.slice(0, 200) : "unknown";

  const limited = await enforceRateLimits([
    { key: `cm:ip:${ip}`, rule: RATE_LIMITS.customerMessagePerIp },
    { key: `cm:tok:${token}`, rule: RATE_LIMITS.customerMessagePerToken },
  ]);
  if (limited) return limited;

  const parsed = customerMessageSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const input = parsed.data;

  const { writer, admin } = await messageClient();

  const { data, error } = await writer.rpc("add_request_customer_message", {
    p_public_token: input.token,
    p_body: input.body,
  });

  if (error) {
    // The RPC raises customer-readable messages ("Unknown request", "This
    // request was canceled — …"), so they go straight back to the form.
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const result = data as CustomerMessageResult;

  // Staff notification is best-effort and must never hold up the 200 the
  // form is waiting on: it runs once the response has been sent.
  after(async () => {
    try {
      await notifyStaff(result, input.body, admin);
    } catch (err) {
      console.error("customer message notification failed:", err);
    }
  });

  // Nothing from the RPC result reaches the browser — not even the row id.
  return NextResponse.json({ ok: true });
}

/**
 * "Customer replied" to the company's notification inbox and, when the
 * request is assigned, to the assignee too — de-duplicated in case the
 * assignee *is* the notification inbox. The assignee's email lives in
 * auth.users, which only the service role can read; without the admin
 * client that half is simply skipped.
 */
async function notifyStaff(
  result: CustomerMessageResult,
  body: string,
  admin: SupabaseClient | null
): Promise<void> {
  const recipients = new Set<string>();

  // Null when the RPC ran without the service-role key — see messageClient().
  if (result.company_notification_email) {
    recipients.add(result.company_notification_email.trim().toLowerCase());
  }

  if (admin && result.assigned_to) {
    const { data: userResult, error: userError } = await admin.auth.admin.getUserById(
      result.assigned_to
    );
    const email = userResult?.user?.email;
    if (userError) {
      console.error("customer message: assignee lookup failed:", userError.message);
    } else if (email) {
      recipients.add(email.trim().toLowerCase());
    }
  }

  if (recipients.size === 0) return;

  const { subject, html, text } = buildCustomerMessageEmail({
    equipmentName: result.equipment_name,
    contactName: result.contact_name,
    body,
    status: result.status,
    dashboardUrl: `${serverEnv.NEXT_PUBLIC_APP_URL}/dashboard/requests/${result.request_id}`,
  });

  for (const to of recipients) {
    await sendEmail({ to, subject, html, text });
  }
}
