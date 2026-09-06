import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { brandingForEmail } from "@/lib/email/request-status";
import { buildPmDueEmail } from "@/lib/email/pm-due";
import { buildServiceRequestNotificationEmail } from "@/lib/email/service-request-notification";
import { sendEmail } from "@/lib/email/send";
import { getRequestStatusUrl } from "@/lib/qr";
import { formatDateOnly } from "@/lib/schedule";
import { serverEnv } from "@/lib/env";
import type { PlanId } from "@/lib/plans";
import type { GeneratedMaintenanceRequest } from "@/lib/types";

// Needs the Node runtime for the service-role admin client.
export const runtime = "nodejs";

function isPlanId(value: unknown): value is PlanId {
  return value === "starter" || value === "pro" || value === "business";
}

/**
 * Daily job (see vercel.json): turns every due maintenance schedule into a
 * `source='pm'` service request via the `generate_due_maintenance_requests()`
 * RPC (migration 0019 — idempotent per cycle), then emails the customer (when
 * opted in) and always notifies the company's own notification address.
 */
export async function GET(request: Request) {
  const expected = serverEnv.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data, error } = await admin.rpc("generate_due_maintenance_requests");
  if (error) {
    console.error("pm-due cron: generate_due_maintenance_requests failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const generated = (data as GeneratedMaintenanceRequest[] | null) ?? [];
  let customerEmailsSent = 0;
  let staffEmailsSent = 0;

  for (const row of generated) {
    const dueDateText = formatDateOnly(row.due_on);
    const statusUrl = getRequestStatusUrl(row.public_token);
    const dashboardUrl = `${serverEnv.NEXT_PUBLIC_APP_URL}/dashboard/requests/${row.request_id}`;

    if (row.notify_customer && row.customer_updates_enabled && row.contact_email) {
      try {
        const { data: planFlags } = await admin.rpc("get_company_plan_flags", { p_company_id: row.company_id });
        const flags = planFlags as { plan_id?: string } | null;
        const planId = isPlanId(flags?.plan_id) ? flags?.plan_id : null;

        const brand = brandingForEmail({
          company: {
            name: row.company_name,
            phone: row.company_phone,
            sms_number: null,
            logo_path: row.company_logo_path,
            brand_color: row.company_brand_color,
          },
          planId,
          supabaseUrl: serverEnv.NEXT_PUBLIC_SUPABASE_URL,
        });

        const { subject, html, text } = buildPmDueEmail({
          brand,
          equipmentName: row.equipment_name,
          scheduleName: row.schedule_name,
          contactName: row.contact_name,
          dueDateText,
          statusUrl,
        });

        const sent = await sendEmail({ to: row.contact_email, subject, html, text });
        if (sent) customerEmailsSent++;
      } catch (err) {
        console.error(`pm-due cron: customer email failed for request ${row.request_id}:`, err);
      }
    }

    if (row.company_notification_email) {
      try {
        const { subject, html, text } = buildServiceRequestNotificationEmail({
          equipmentName: row.equipment_name,
          contactName: row.contact_name,
          contactEmail: row.contact_email,
          contactPhone: null,
          description: `Preventive maintenance due ${dueDateText}: ${row.schedule_name}`,
          mediaCount: 0,
          aiSummary: null,
          troubleshootingPath: [],
          dashboardUrl,
        });

        const sent = await sendEmail({ to: row.company_notification_email, subject, html, text });
        if (sent) staffEmailsSent++;
      } catch (err) {
        console.error(`pm-due cron: staff email failed for request ${row.request_id}:`, err);
      }
    }
  }

  return NextResponse.json({ generated: generated.length, customerEmailsSent, staffEmailsSent });
}
