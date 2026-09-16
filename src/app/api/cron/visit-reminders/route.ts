import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitRequestActivity } from "@/lib/events";
import { brandingForEmail } from "@/lib/email/request-status";
import { buildVisitReminderEmail } from "@/lib/email/visit-reminder";
import { buildAssigneeNotificationEmail } from "@/lib/email/assignment";
import { sendEmail } from "@/lib/email/send";
import { getRequestStatusUrl, getEquipmentPublicUrl } from "@/lib/qr";
import { pickBestCode } from "@/lib/qr-codes";
import { formatCompanyLongDateTime } from "@/lib/format";
import { serverEnv } from "@/lib/env";
import type { PlanId } from "@/lib/plans";
import type { Company, Customer, Equipment, Location, Profile, QrCode, ServiceRequest } from "@/lib/types";

// Needs the Node runtime for the service-role admin client.
export const runtime = "nodejs";

const REMINDER_WINDOW_HOURS = 36;

function isPlanId(value: unknown): value is PlanId {
  return value === "starter" || value === "pro" || value === "business";
}

type ReminderEquipment = Pick<Equipment, "name" | "address" | "customer_id" | "location_id">;

/**
 * Resolves the site/customer label, address and a staff-scan link for the
 * assigned technician's reminder email — everything
 * buildAssigneeNotificationEmail() needs beyond the request/company fields
 * the caller already has. Vocab-aware (customer for service_provider,
 * location for equipment_owner — C1-44). Takes the equipment row the caller
 * already fetched (this runs inside a per-row cron loop, so it reuses that
 * query instead of re-fetching it). Never throws; a lookup failure just
 * means a thinner (still honest) email. Mirrors the identical helper in
 * requests/actions.ts and requests/schedule-actions.ts, adapted for the
 * admin client and a pre-fetched equipment row.
 */
async function resolveAssigneeSiteContext(
  admin: SupabaseClient,
  companyKind: Company["kind"],
  equipment: ReminderEquipment | null,
  equipmentId: string
): Promise<{ siteName: string | null; address: string | null; staffScanUrl: string | null }> {
  let siteName: string | null = null;
  let address = equipment?.address ?? null;

  if (companyKind === "equipment_owner" && equipment?.location_id) {
    const { data: location } = await admin
      .from("locations")
      .select("name, address")
      .eq("id", equipment.location_id)
      .maybeSingle<Pick<Location, "name" | "address">>();
    siteName = location?.name ?? null;
    address = address || (location?.address ?? null);
  } else if (equipment?.customer_id) {
    const { data: customer } = await admin
      .from("customers")
      .select("name, address")
      .eq("id", equipment.customer_id)
      .maybeSingle<Pick<Customer, "name" | "address">>();
    siteName = customer?.name ?? null;
    address = address || (customer?.address ?? null);
  }

  const { data: codes } = await admin
    .from("qr_codes")
    .select("token, status, equipment_id")
    .eq("equipment_id", equipmentId)
    .returns<Pick<QrCode, "token" | "status" | "equipment_id">[]>();

  const best = pickBestCode(codes ?? []);
  const staffScanUrl = best ? getEquipmentPublicUrl(best.token) : null;

  return { siteName, address, staffScanUrl };
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
 *
 * Also best-effort reminds the assigned technician, if any (C1-44). That
 * side has no "sent" column of its own to claim independently — adding one
 * needs a migration — so it rides the same claim / customer_updates_enabled
 * gate as the customer reminder rather than being tracked separately. In
 * practice that only matters if a company turns customer_updates_enabled off
 * mid-trial; technicians would stop getting cron reminders too. See
 * docs/EMAILS.md.
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
  let assigneeEmailsSent = 0;
  let skipped = 0;

  for (const req of requests) {
    if (!req.contact_email || !req.scheduled_for) {
      skipped++;
      continue;
    }

    const [{ data: company }, { data: equipment }, { data: planFlags }] = await Promise.all([
      admin.from("companies").select("*").eq("id", req.company_id).maybeSingle<Company>(),
      admin
        .from("equipment")
        .select("name, address, customer_id, location_id")
        .eq("id", req.equipment_id)
        .maybeSingle<ReminderEquipment>(),
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

    // Company-zone, zone-labeled ("...at 10:00 AM CDT") — shared by the
    // customer reminder below and the technician reminder further down
    // (C1-23 / Q-01: this used to be formatZonedDateTime(), which has no
    // zone label and reads the server's own TZ on some code paths).
    const whenText = formatCompanyLongDateTime(req.scheduled_for, company.timezone);

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
        whenText,
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

    // Also remind the assigned technician (C1-44). Independent try/catch:
    // this is a bonus notification, not the job this cron exists to
    // guarantee, so it must never affect the customer email's claim/release
    // bookkeeping above.
    if (req.assigned_to) {
      try {
        const [{ data: userResult, error: userError }, { data: assigneeProfile }] = await Promise.all([
          admin.auth.admin.getUserById(req.assigned_to),
          admin
            .from("profiles")
            .select("full_name")
            .eq("id", req.assigned_to)
            .maybeSingle<Pick<Profile, "full_name">>(),
        ]);
        const assigneeEmail = userResult?.user?.email;

        if (!userError && assigneeEmail) {
          const { siteName, address, staffScanUrl } = await resolveAssigneeSiteContext(
            admin,
            company.kind,
            equipment,
            req.equipment_id
          );

          const { subject, html, text } = buildAssigneeNotificationEmail({
            reason: "reminder",
            technicianName: assigneeProfile?.full_name ?? null,
            equipmentName: equipment?.name ?? "your equipment",
            siteName,
            address,
            whenText,
            staffScanUrl,
            requestUrl: `${serverEnv.NEXT_PUBLIC_APP_URL}/dashboard/requests/${req.id}`,
          });

          const assigneeSent = await sendEmail({ to: assigneeEmail, subject, html, text });
          if (assigneeSent) assigneeEmailsSent++;
        }
      } catch (err) {
        console.error(`visit-reminders cron: assignee reminder failed for request ${req.id}:`, err);
      }
    }
  }

  return NextResponse.json({ candidates: requests.length, emailsSent, assigneeEmailsSent, skipped });
}
