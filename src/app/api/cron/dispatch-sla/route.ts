import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitRequestActivity } from "@/lib/events";
import { buildDispatchSlaAlertEmail } from "@/lib/email/dispatch-sla";
import { sendEmail } from "@/lib/email/send";
import { serverEnv } from "@/lib/env";
import { REQUEST_PRIORITY_LABELS } from "@/components/status-badge";
import type { DispatchSlaAlert, RequestPriority } from "@/lib/types";

// Needs the Node runtime for the service-role admin client.
export const runtime = "nodejs";

/**
 * Hourly job (see vercel.json) that emails an owner when a vendor hasn't
 * acknowledged/viewed a dispatch within `vendors.ack_sla_minutes`
 * (docs/OWNER-ROADMAP-BRIEF.md §3.3.8/§7.10). Every candidate row is claimed
 * atomically inside claim_dispatch_sla_alerts() — one UPDATE ... FOR UPDATE
 * SKIP LOCKED, the same pattern src/app/api/cron/visit-reminders/route.ts
 * uses, just done in SQL so overlapping cron runs can't both claim a row —
 * so this route only has to send the email and release its OWN claim
 * (matched on the stamp it passed in) when the send didn't go out.
 */
export async function GET(request: Request) {
  const expected = serverEnv.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const claimStamp = new Date().toISOString();

  const { data: claimed, error } = await admin.rpc("claim_dispatch_sla_alerts", {
    p_claim_stamp: claimStamp,
    p_limit: 50,
  });

  if (error) {
    console.error("dispatch-sla cron: claim_dispatch_sla_alerts failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const alerts = (claimed ?? []) as DispatchSlaAlert[];
  let emailsSent = 0;
  let skipped = 0;

  for (const alert of alerts) {
    if (!alert.company_notification_email) {
      // Nowhere to send it — release so a later run (once notification_email
      // is set) can still alert.
      await releaseClaim(admin, alert.dispatch_id, claimStamp);
      skipped++;
      continue;
    }

    try {
      const { subject, html, text } = buildDispatchSlaAlertEmail({
        vendorName: alert.vendor_name,
        vendorPhone: alert.vendor_phone,
        equipmentName: alert.equipment_name,
        locationName: alert.location_name,
        minutesOverdue: alert.minutes_overdue,
        priorityLabel: REQUEST_PRIORITY_LABELS[alert.request_priority as RequestPriority],
        requestUrl: `${serverEnv.NEXT_PUBLIC_APP_URL}/dashboard/requests/${alert.request_id}`,
      });

      const sent = await sendEmail({ to: alert.company_notification_email, subject, html, text });
      if (!sent) {
        await releaseClaim(admin, alert.dispatch_id, claimStamp);
        skipped++;
        continue;
      }

      emailsSent++;
    } catch (err) {
      console.error(`dispatch-sla cron: failed for dispatch ${alert.dispatch_id}:`, err);
      await releaseClaim(admin, alert.dispatch_id, claimStamp);
      skipped++;
      continue;
    }

    // Bookkeeping after the email is out. A failure here must not release
    // the claim (the owner already has the alert) — just log it, same as
    // visit-reminders.
    try {
      await emitRequestActivity(admin, {
        companyId: alert.company_id,
        serviceRequestId: alert.request_id,
        kind: "email_sent",
        visibility: "internal",
        body: `SLA alert emailed to ${alert.company_notification_email} — ${alert.vendor_name} hasn't responded in ${alert.minutes_overdue} minutes`,
        metadata: { to: alert.company_notification_email, dispatch_id: alert.dispatch_id, minutes_overdue: alert.minutes_overdue },
        authorKind: "system",
      });
    } catch (err) {
      console.error(`dispatch-sla cron: sent but failed to record activity for ${alert.dispatch_id}:`, err);
    }
  }

  return NextResponse.json({ candidates: alerts.length, emailsSent, skipped });
}

/** Undoes THIS run's own claim only (matched on the stamp it wrote), so the next hourly run retries. */
async function releaseClaim(
  admin: ReturnType<typeof createAdminClient>,
  dispatchId: string,
  claimStamp: string
): Promise<void> {
  const { error } = await admin
    .from("dispatches")
    .update({ sla_alerted_at: null })
    .eq("id", dispatchId)
    .eq("sla_alerted_at", claimStamp);
  if (error) {
    console.error(`dispatch-sla cron: failed to release dispatch ${dispatchId}:`, error.message);
  }
}
