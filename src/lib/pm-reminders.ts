// Pure logic behind preventive-maintenance reminders: the "Maintenance" list
// filter (which date window a value means) and the daily cron's selection,
// grouping and wording. No I/O — the route in src/app/api/cron/pm-reminders
// and the equipment list page do the querying; this file is unit-tested in
// pm-reminders.test.ts.

import { PM_DUE_SOON_DAYS, daysUntilDate } from "@/lib/equipment";
import type { Equipment } from "@/lib/types";

// ----------------------------------------------------------------------------
// Dates
// ----------------------------------------------------------------------------

/** `now` as a "YYYY-MM-DD" UTC day — the same day arithmetic daysUntilDate() uses. */
export function todayDateOnly(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" plus (or minus) whole days, in UTC. */
export function addDays(dateOnly: string, days: number): string {
  const stamp = Date.UTC(
    Number(dateOnly.slice(0, 4)),
    Number(dateOnly.slice(5, 7)) - 1,
    Number(dateOnly.slice(8, 10))
  );
  return new Date(stamp + days * 86_400_000).toISOString().slice(0, 10);
}

// ----------------------------------------------------------------------------
// List filter
// ----------------------------------------------------------------------------

export const PM_FILTER_VALUES = ["any", "overdue", "due_soon", "scheduled", "none"] as const;

export type PmFilter = (typeof PM_FILTER_VALUES)[number];

export const PM_FILTER_LABELS: Record<PmFilter, string> = {
  any: "Any",
  overdue: "Overdue",
  due_soon: `Due within ${PM_DUE_SOON_DAYS} days`,
  scheduled: "Scheduled later",
  none: "Not scheduled",
};

export function isPmFilter(value: string | undefined): value is PmFilter {
  return !!value && (PM_FILTER_VALUES as readonly string[]).includes(value);
}

/**
 * What a `?pm=` value means as a condition on `equipment.next_service_due_on`,
 * as inclusive "YYYY-MM-DD" bounds the list page hands straight to PostgREST.
 * `due_soon` deliberately includes overdue units — it is the "needs a visit"
 * view the overview card links to — while `overdue` is the strict subset.
 * Null means "no filter" (`any`, or an unknown value).
 */
export function pmFilterRange(
  value: string | undefined,
  now: Date = new Date()
): { gte?: string; lte?: string; isNull?: true } | null {
  const today = todayDateOnly(now);
  switch (value) {
    case "overdue":
      return { lte: addDays(today, -1) };
    case "due_soon":
      return { lte: addDays(today, PM_DUE_SOON_DAYS) };
    case "scheduled":
      return { gte: addDays(today, PM_DUE_SOON_DAYS + 1) };
    case "none":
      return { isNull: true };
    default:
      return null;
  }
}

// ----------------------------------------------------------------------------
// Daily reminder job
// ----------------------------------------------------------------------------

/** How far ahead the daily job looks: a unit due inside this many days gets its reminder. */
export const PM_REMINDER_WINDOW_DAYS = 7;

/** Rows one cron run will consider. Anything past this waits for tomorrow's run. */
export const PM_REMINDER_BATCH_LIMIT = 500;

/** Statuses that still get reminders — a retired or out-of-service unit isn't on anyone's route. */
export const PM_REMINDER_STATUSES = ["active", "needs_service"] as const;

/** The columns the cron reads. Kept narrow so a test can build rows by hand. */
export type PmCandidate = Pick<
  Equipment,
  | "id"
  | "company_id"
  | "name"
  | "customer_id"
  | "location"
  | "status"
  | "next_service_due_on"
  | "pm_reminder_sent_for"
>;

/**
 * Which candidate rows actually need a reminder today: on an eligible status,
 * due on or before today + PM_REMINDER_WINDOW_DAYS, and not already reminded
 * for this exact due date (`pm_reminder_sent_for` is stamped after a send,
 * so a unit stays quiet however long it sits overdue — until a service moves
 * the due date, which makes it a new reminder). Sorted soonest-due first.
 */
export function selectDueUnits<T extends PmCandidate>(rows: T[], today: string): T[] {
  const horizon = addDays(today, PM_REMINDER_WINDOW_DAYS);
  return rows
    .filter((row) => {
      if (!row.next_service_due_on) return false;
      if (!(PM_REMINDER_STATUSES as readonly string[]).includes(row.status)) return false;
      if (row.next_service_due_on > horizon) return false;
      return row.pm_reminder_sent_for !== row.next_service_due_on;
    })
    .sort((a, b) => (a.next_service_due_on as string).localeCompare(b.next_service_due_on as string));
}

/** Units bucketed by company, preserving the input order inside each bucket. */
export function groupByCompany<T extends { company_id: string }>(rows: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = groups.get(row.company_id);
    if (bucket) {
      bucket.push(row);
    } else {
      groups.set(row.company_id, [row]);
    }
  }
  return groups;
}

/** "overdue by 3 days" / "due today" / "due in 5 days" — the phrase after a unit's name in the digest. */
export function describeDue(dueOn: string, today: string): string {
  const days = daysUntilDate(dueOn, new Date(`${today}T00:00:00Z`)) ?? 0;
  const word = Math.abs(days) === 1 ? "day" : "days";
  if (days < 0) return `overdue by ${-days} ${word}`;
  if (days === 0) return "due today";
  return `due in ${days} ${word}`;
}
