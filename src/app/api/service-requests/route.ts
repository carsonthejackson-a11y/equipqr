import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { summarizeTroubleshootingPath } from "@/lib/anthropic";
import { buildServiceRequestNotificationEmail } from "@/lib/email/service-request-notification";
import { buildRequestReceivedEmail, brandingForEmail } from "@/lib/email/request-status";
import { sendEmail } from "@/lib/email/send";
import { enforceRateLimits, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { getCompanyPlanFlags } from "@/lib/billing";
import { getRequestStatusUrl } from "@/lib/qr";
import { serverEnv } from "@/lib/env";
import { firstIssueMessage, serviceRequestSchema } from "@/lib/public-request";
import { REQUEST_PRIORITY_LABELS } from "@/components/status-badge";

// The one write path open to the anonymous internet. Order matters:
// rate limit first (before any parsing, DB work or AI call), then validate,
// then create the request through the security-definer RPC that resolves the
// company server-side. Nothing here trusts a company id from the client.

type PathEntry = { question: string; answer: string };

type SubmitResult = {
  request_id: string;
  public_token: string;
  company_id: string;
  company_name: string;
  /** Service-role callers only — null on an anon call (migration 0018). */
  company_notification_email: string | null;
  company_phone: string | null;
  company_logo_path: string | null;
  company_brand_color: string | null;
  customer_updates_enabled: boolean;
  equipment_name: string;
};

/** Once per server process, not once per submission. */
let warnedNoServiceRole = false;

/**
 * The client that runs `submit_service_request`. Migration 0018 only returns
 * the company's internal `notification_email` to the service role, so the
 * admin client is what makes the staff notification email possible. Without a
 * service-role key the submission still works end to end — it just can't tell
 * staff about it, which we say out loud once.
 */
async function submitClient(): Promise<SupabaseClient> {
  try {
    return createAdminClient();
  } catch {
    if (!warnedNoServiceRole) {
      warnedNoServiceRole = true;
      console.warn(
        "SUPABASE_SERVICE_ROLE_KEY is not configured — staff notification emails for new service requests will be skipped (the company's notification address is only returned to the service role)."
      );
    }
    return createClient();
  }
}

export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const ip = getClientIp(request);
  const token = typeof raw?.qrToken === "string" ? raw.qrToken.slice(0, 200) : "unknown";

  const limited = await enforceRateLimits([
    { key: `sr:ip:${ip}`, rule: RATE_LIMITS.serviceRequestPerIp },
    { key: `sr:tok:${token}`, rule: RATE_LIMITS.serviceRequestPerToken },
  ]);
  if (limited) return limited;

  const parsed = serviceRequestSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const body = parsed.data;

  const supabase = await createClient();
  const writer = await submitClient();

  const { data, error } = await writer.rpc("submit_service_request", {
    p_qr_token: body.qrToken,
    p_description: body.description,
    p_contact_name: body.contactName,
    p_contact_email: body.contactEmail,
    p_contact_phone: body.contactPhone,
    p_media: body.media,
    p_troubleshooting_path: body.troubleshootingPath,
    p_priority: body.priority,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const result = data as SubmitResult;
  const statusUrl = getRequestStatusUrl(result.public_token);

  const aiSummary = await summarizeTroubleshootingPath({
    equipmentName: result.equipment_name,
    description: body.description,
    path: body.troubleshootingPath,
  });

  if (aiSummary) {
    // Anon has no RLS update grant on service_requests, so this goes through
    // a security-definer RPC keyed on id + the public token we were just
    // handed (migration 0015) rather than a direct table write, which was
    // silently dropped.
    const { error: summaryError } = await supabase.rpc("set_request_ai_summary", {
      p_request_id: result.request_id,
      p_public_token: result.public_token,
      p_summary: aiSummary,
    });
    if (summaryError) {
      console.error("set_request_ai_summary failed:", summaryError.message);
    }
  }

  await sendStaffNotification(result, body, aiSummary);
  await sendRequesterReceipt(result, body, statusUrl);

  return NextResponse.json({
    id: result.request_id,
    publicToken: result.public_token,
    statusUrl,
  });
}

async function sendStaffNotification(
  result: SubmitResult,
  body: { contactName: string; contactEmail: string; contactPhone: string; description: string; media: unknown[]; troubleshootingPath: PathEntry[]; priority: "low" | "normal" | "high" },
  aiSummary: string | null
) {
  // Null when the RPC ran without the service-role key — see submitClient().
  if (!result.company_notification_email) return;

  const dashboardUrl = `${serverEnv.NEXT_PUBLIC_APP_URL}/dashboard/requests/${result.request_id}`;

  const { subject, html, text } = buildServiceRequestNotificationEmail({
    equipmentName: result.equipment_name,
    contactName: body.contactName,
    contactEmail: body.contactEmail,
    contactPhone: body.contactPhone,
    description: body.description,
    mediaCount: body.media.length,
    priority: REQUEST_PRIORITY_LABELS[body.priority],
    aiSummary,
    troubleshootingPath: body.troubleshootingPath,
    dashboardUrl,
  });

  await sendEmail({ to: result.company_notification_email, subject, html, text });
}

/**
 * "We got it, here's how to check on it." Skipped when the requester left no
 * email or the company turned customer updates off. Never blocks the
 * response body the form is waiting on beyond the send itself, and never
 * throws — the request is already safely recorded by this point.
 */
async function sendRequesterReceipt(
  result: SubmitResult,
  body: { contactEmail: string; contactName: string },
  statusUrl: string
) {
  if (!body.contactEmail || !result.customer_updates_enabled) return;

  try {
    const planFlags = await getCompanyPlanFlags(result.company_id);
    const brand = brandingForEmail({
      company: {
        name: result.company_name,
        phone: result.company_phone,
        sms_number: null,
        logo_path: result.company_logo_path,
        brand_color: result.company_brand_color,
      },
      planId: planFlags?.plan_id,
      supabaseUrl: serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    });

    const { subject, html, text } = buildRequestReceivedEmail({
      brand,
      equipmentName: result.equipment_name,
      contactName: body.contactName,
      statusUrl,
    });

    await sendEmail({ to: body.contactEmail, subject, html, text });
  } catch (err) {
    console.error("request received email failed:", err);
  }
}
