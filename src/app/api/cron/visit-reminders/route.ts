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
 * changes, see schedule-actions.ts) and have an email on file. Each row is
 * claimed by stamping `reminder_sent_at` atomically before the send and
 * released (stamp cleared) if nothing went out, so overlapping runs can't
 * double-email and tomorrow's run still retries a declined send.
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

    // Claim the row BEFORE sending: two overlapping runs (a manual trigger
    // alongside the schedule, a retried invocation) would otherwise both pass
    // the `reminder_sent_at is null` query above and both email. The
    // conditional update is atomic — only one caller gets the row back — and
    // it re-checks what the query saw, so a request that was rescheduled,
    // unscheduled or closed in the meantime is skipped rather than emailed
    // with a stale time. The stamp value is unique to this attempt so the
    // release below can never clear a claim made by someone else.
    const claimStamp = new Date().toISOString();
    const { data: claimed, error: claimError } = await admin
      .from("service_requests")
      .update({ reminder_sent_at: claimStamp })
      .eq("id", req.id)
      .eq("status", "scheduled")
      .eq("scheduled_for", req.scheduled_for)
      .is("reminder_sent_at", null)
      .select("id")
      .maybeSingle<{ id: string }>();

    if (claimError) {
      console.error(`visit-reminders cron: failed to claim request ${req.id}:`, claimError.message);
      skipped++;
      continue;
    }
    if (!claimed) {
      // Another run got there first, or the request changed under us.
      skipped++;
      continue;
    }

    // Undo OUR claim only (matched on the stamp we wrote), so the next run
    // tries again. Nothing went out, so the stamp must not stick.
    const releaseClaim = async () => {
      const { error: releaseError } = await admin
        .from("service_requests")
        .update({ reminder_sent_at: null })
        .eq("id", req.id)
        .eq("reminder_sent_at", claimStamp);
      if (releaseError) {
        console.error(`visit-reminders cron: failed to release request ${req.id}:`, releaseError.message);
      }
    };

    try {
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
        // Email not configured or the provider declined.
        await releaseClaim();
        skipped++;
        continue;
      }

      emailsSent++;
    } catch (err) {
      // Building or sending threw: nothing reached the customer, so hand the
      // row back exactly as in the declined case.
      console.error(`visit-reminders cron: failed for request ${req.id}:`, err);
      await releaseClaim();
      skipped++;
      continue;
    }

    // Bookkeeping after the email is out. A failure here must not release
    // the claim (the customer already has the reminder), just be logged.
    try {
      await emitRequestActivity(admin, {
        companyId: req.company_id,
        serviceRequestId: req.id,
        kind: "email_sent",
        visibility: "internal",
        body: `Visit reminder emailed to ${req.contact_email}`,
        metadata: { to: req.contact_email, scheduled_for: req.scheduled_for },
        authorKind: "system",
      });
    } catch (err) {
      console.error(`visit-reminders cron: sent but failed to record activity for ${req.id}:`, err);
    }
  }

  return NextResponse.json({ candidates: requests.length, emailsSent, skipped });
}
