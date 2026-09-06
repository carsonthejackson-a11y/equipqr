import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildPmReminderEmail, type PmReminderUnit } from "@/lib/email/pm-reminder";
import { sendEmail } from "@/lib/email/send";
import { emitEquipmentEvent } from "@/lib/events";
import { serverEnv } from "@/lib/env";
import {
  PM_REMINDER_BATCH_LIMIT,
  PM_REMINDER_STATUSES,
  PM_REMINDER_WINDOW_DAYS,
  addDays,
  describeDue,
  groupByCompany,
  selectDueUnits,
  todayDateOnly,
  type PmCandidate,
} from "@/lib/pm-reminders";
import type { Company, Customer, EquipmentEvent } from "@/lib/types";

// Needs the Node runtime for the service-role admin client.
export const runtime = "nodejs";

type CompanyRow = Pick<Company, "id" | "name" | "notification_email">;

/**
 * Daily job (see vercel.json) behind preventive-maintenance reminders. For
 * every unit whose next_service_due_on falls inside the next
 * PM_REMINDER_WINDOW_DAYS (or is already past) and hasn't been reminded for
 * that exact due date yet, it appends a `pm_due` timeline event and sends
 * the company ONE digest email listing all such units. Vercel Cron calls
 * this with a GET and an `Authorization: Bearer <CRON_SECRET>` header;
 * anything else is rejected — identical to trial-reminders.
 *
 * Locked companies (trial over, no subscription — `is_locked` from
 * get_company_plan_flags) are skipped entirely: no event, no email, no
 * stamp. Nobody there can act on the reminder, and the moment they
 * subscribe again the next run picks the units straight back up.
 *
 * Stamping: every unit the run processed gets pm_reminder_sent_for =
 * next_service_due_on, whatever happened to the email (sent, not configured,
 * or failed). The timeline event is the durable record; the digest is a
 * best-effort nudge. Anything left unstamped would sort to the front of
 * every future batch (oldest due date first) and, past the batch cap,
 * starve every other tenant — so nothing is left unstamped on purpose.
 */
export async function GET(request: Request) {
  const expected = serverEnv.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const today = todayDateOnly();
  const horizon = addDays(today, PM_REMINDER_WINDOW_DAYS);
  const emailConfigured = !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // Candidates: due inside the window, on an eligible status, and not yet
  // reminded for this exact due date. That last condition compares two
  // columns (which PostgREST can't express), so migration 0024 materialises
  // it as the generated `pm_reminder_pending` flag — filtering on it here
  // keeps already-reminded overdue units from crowding out the batch.
  // selectDueUnits() re-applies the same rule in TS as a belt-and-braces
  // check. The cap keeps one run bounded; what it leaves behind is picked
  // up tomorrow, since only stamped rows drop out of the flag.
  const { data: candidates, error } = await admin
    .from("equipment")
    .select("id, company_id, name, customer_id, location, status, next_service_due_on, pm_reminder_sent_for")
    .in("status", [...PM_REMINDER_STATUSES])
    .eq("pm_reminder_pending", true)
    .lte("next_service_due_on", horizon)
    .order("next_service_due_on", { ascending: true })
    .limit(PM_REMINDER_BATCH_LIMIT)
    .returns<PmCandidate[]>();

  if (error) {
    console.error("pm-reminders cron: failed to query equipment:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const due = selectDueUnits(candidates ?? [], today);
  const byCompany = groupByCompany(due);

  let companiesNotified = 0;
  let unitsFlagged = 0;
  let emailsSent = 0;

  for (const [companyId, units] of byCompany) {
    const { data: company } = await admin
      .from("companies")
      .select("id, name, notification_email")
      .eq("id", companyId)
      .maybeSingle<CompanyRow>();
    if (!company) continue;

    // Locked = trial over and nothing behind it. Nobody there can act on a
    // reminder, so no event and no email — but the units ARE stamped for
    // this due date, or they would sort to the front of every future batch
    // and starve other tenants. The next due date (after they subscribe and
    // service the unit) is a fresh reminder. Fails open on an RPC error: a
    // billing hiccup shouldn't silence maintenance reminders.
    const { data: flags } = await admin.rpc("get_company_plan_flags", { p_company_id: companyId });
    if ((flags as { is_locked?: boolean } | null)?.is_locked) {
      unitsFlagged += await stampUnits(admin, companyId, units);
      continue;
    }

    const customerIds = [...new Set(units.map((u) => u.customer_id).filter((id): id is string => !!id))];
    const { data: customers } =
      customerIds.length > 0
        ? await admin
            .from("customers")
            .select("id, name")
            .eq("company_id", companyId)
            .in("id", customerIds)
            .returns<Pick<Customer, "id" | "name">[]>()
        : { data: [] as Pick<Customer, "id" | "name">[] };
    const customerName = new Map((customers ?? []).map((c) => [c.id, c.name]));

    // Timeline rows this run already wrote for these exact due dates (a
    // previous run whose email failed) — never append the same one twice.
    const { data: priorEvents } = await admin
      .from("equipment_events")
      .select("equipment_id, details")
      .eq("company_id", companyId)
      .eq("kind", "pm_due")
      .in(
        "equipment_id",
        units.map((u) => u.id)
      )
      .returns<Pick<EquipmentEvent, "equipment_id" | "details">[]>();
    const alreadyLogged = new Set(
      (priorEvents ?? []).map((e) => `${e.equipment_id}:${String(e.details?.due_on ?? "")}`)
    );

    const emailUnits: PmReminderUnit[] = [];

    for (const unit of units) {
      const dueOn = unit.next_service_due_on as string;
      const description = describeDue(dueOn, today);

      if (!alreadyLogged.has(`${unit.id}:${dueOn}`)) {
        // emitEquipmentEvent() with the admin client: RLS is bypassed, so the
        // company_id we pass is the whole tenant scoping. It also fans out to
        // the company's webhooks.
        await emitEquipmentEvent(admin, {
          companyId,
          equipmentId: unit.id,
          kind: "pm_due",
          summary: `Maintenance due ${dueOn}`,
          details: { due_on: dueOn, description },
          actorKind: "system",
        });
      }

      emailUnits.push({
        name: unit.name,
        customer: unit.customer_id ? customerName.get(unit.customer_id) ?? null : null,
        location: unit.location,
        dueOn,
        description,
        url: `${appUrl}/dashboard/equipment/${unit.id}`,
      });
    }

    let sent = false;
    if (emailConfigured && company.notification_email) {
      const { subject, html, text } = buildPmReminderEmail({
        companyName: company.name,
        units: emailUnits,
        equipmentListUrl: `${appUrl}/dashboard/equipment?pm=due_soon`,
      });
      sent = await sendEmail({ to: company.notification_email, subject, html, text });
      if (sent) emailsSent++;
    }

    // The digest is best-effort: the timeline event is the durable record
    // and it is already written. A send that fails (bouncing inbox, Resend
    // outage) is logged, not retried — retrying would keep these units at
    // the head of every batch until the address is fixed, starving every
    // other tenant of reminders.
    if (!sent && emailConfigured && company.notification_email) {
      console.error(`pm-reminders cron: digest for company ${companyId} not sent (timeline events were recorded)`);
    }

    unitsFlagged += await stampUnits(admin, companyId, units);
    companiesNotified++;
  }

  return NextResponse.json({ companiesNotified, unitsFlagged, emailsSent });
}

/**
 * Stamps pm_reminder_sent_for = next_service_due_on on each unit — one
 * update per unit, since the stamp has to equal that unit's own due date.
 * Returns how many stuck. A unit that fails to stamp is picked up again
 * tomorrow (its pm_due event is de-duplicated).
 */
async function stampUnits(
  admin: ReturnType<typeof createAdminClient>,
  companyId: string,
  units: PmCandidate[]
): Promise<number> {
  let stamped = 0;
  for (const unit of units) {
    const { error } = await admin
      .from("equipment")
      .update({ pm_reminder_sent_for: unit.next_service_due_on })
      .eq("id", unit.id)
      .eq("company_id", companyId);
    if (error) {
      console.error(`pm-reminders cron: failed to stamp unit ${unit.id}:`, error.message);
      continue;
    }
    stamped++;
  }
  return stamped;
}
