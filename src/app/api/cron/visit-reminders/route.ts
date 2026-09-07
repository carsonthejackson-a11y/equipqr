import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitRequestActivity } from "@/lib/events";
import { brandingForEmail } from "@/lib/email/request-status";
import { buildVisitReminderEmail } from "@/lib/email/visit-reminder";
import { sendEmail } from "@/lib/email/send";
import { getRequestStatusUrl } from "@/lib/qr";
import { formatZonedDateTime } from "@/lib/schedule";
import { serverEnv } from "@/lib/env";
import type { PlanId } from "@/lib/plans";
import type { Company, Equipment, ServiceRequest } from "@/lib/types";

// Needs the Node runtime for the service-role admin client.
export const runtime = "nodejs";

const REMINDER_WINDOW_HOURS = 36;

function isPlanId(value: unknown): value is PlanId {
  return value === "starter" || value === "pro" || value === "business";
}

/**
 * Daily job (see vercel.json) that emails the requester ~1-1.5 days ahead of
 * a scheduled visit. Scoped to `status='scheduled'` visits in the next
 * {@link REMINDER_WINDOW_HOURS} hours that haven't been reminded yet
 * (`reminder_sent_at is null` — cleared automatically if the visit time
 * changes, see schedule-actions.ts) and have an email on file. Stamps
 * `reminder_sent_at` only on a successful send, mirroring trial-reminders'
 * "leave it null so tomorrow's run retries" behaviour.
 */
export async function GET(request: Request) {
  const expected = serverEnv.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_HOURS * 3_600_000);

  const { data: dueRequests, error } = await admin
    .from("service_requests")
    .select("*")
    .eq("status", "scheduled")
    .is("reminder_sent_at", null)
    .not("contact_email", "is", null)
    .gte("scheduled_for", now.toISOString())
    .lte("scheduled_for", windowEnd.toISOString())
    .returns<ServiceRequest[]>();

  if (error) {
    console.error("visit-reminders cron: failed to query service_requests:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const requests = dueRequests ?? [];
  let emailsSent = 0;
  let skipped = 0;

  for (const req of requests) {
    if (!req.contact_email || !req.scheduled_for) {
      skipped++;
      continue;
    }

    const [{ data: company }, { data: equipment }, { data: planFlags }] = await Promise.all([
      admin.from("companies").select("*").eq("id", req.company_id).maybeSingle<Company>(),
      admin.from("equipment").select("name").eq("id", req.equipment_id).maybeSingle<Pick<Equipment, "name">>(),
      admin.rpc("get_company_plan_flags", { p_company_id: req.company_id }),
    ]);

    if (!company || !company.customer_updates_enabled) {
      skipped++;
      continue;
    }

    const flags = planFlags as { plan_id?: string } | null;
    const planId = isPlanId(flags?.plan_id) ? flags?.plan_id : null;

    try {
      // Claim the row BEFORE sending: two overlapping runs (a manual trigger
      // alongside the schedule, a retried invocation) would otherwise both
      // pass the `reminder_sent_at is null` query above and both email. The
      // conditional update is atomic — only one caller gets the row back.
      const { data: claimed, error: claimError } = await admin
        .from("service_requests")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", req.id)
        .is("reminder_sent_at", null)
        .select("id")
        .maybeSingle<{ id: string }>();

      if (claimError) {
        console.error(`visit-reminders cron: failed to claim request ${req.id}:`, claimError.message);
        skipped++;
        continue;
      }
      if (!claimed) {
        // Another run got there first.
        skipped++;
        continue;
      }

      const brand = brandingForEmail({
        company,
        planId,
        supabaseUrl: serverEnv.NEXT_PUBLIC_SUPABASE_URL,
      });

      const { subject, html, text } = buildVisitReminderEmail({
        brand,
        equipmentName: equipment?.name ?? "your equipment",
        contactName: req.contact_name,
        whenText: formatZonedDateTime(req.scheduled_for, company.timezone),
        statusUrl: getRequestStatusUrl(req.public_token),
      });

      const sent = await sendEmail({ to: req.contact_email, subject, html, text });
      if (!sent) {
        // Release the claim so the next run tries again (email not configured,
        // provider error); nothing went out, so the stamp must not stick.
        const { error: releaseError } = await admin
          .from("service_requests")
          .update({ reminder_sent_at: null })
          .eq("id", req.id);
        if (releaseError) {
          console.error(`visit-reminders cron: failed to release request ${req.id}:`, releaseError.message);
        }
        skipped++;
        continue;
      }

      await emitRequestActivity(admin, {
        companyId: req.company_id,
        serviceRequestId: req.id,
        kind: "email_sent",
        visibility: "internal",
        body: `Visit reminder emailed to ${req.contact_email}`,
        metadata: { to: req.contact_email, scheduled_for: req.scheduled_for },
        authorKind: "system",
      });

      emailsSent++;
    } catch (err) {
      console.error(`visit-reminders cron: failed for request ${req.id}:`, err);
      skipped++;
    }
  }

  return NextResponse.json({ candidates: requests.length, emailsSent, skipped });
}
