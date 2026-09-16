// Pure grouping/ordering for the technician "Today" view (Q-47, C1-51,
// I3 §C: "no single screen answers 'what do I do today'"). Everything here
// is synchronous and takes plain data in — no Supabase client, no
// `new Date()` default — so it's covered by plain Vitest tests and so the
// page (page.tsx) stays a thin data-fetch + render shell around it.
//
// Every day-boundary decision is made in the COMPANY's timezone via
// src/lib/schedule.ts's dateKeyInTimeZone()/todayInTimeZone() — never the
// server's own clock — which is the exact bug class Q-02/C1-22 document
// elsewhere in the app (a 9:39 PM Central visit must not read as "tomorrow").

import { addDaysToDateOnly, dateKeyInTimeZone } from "@/lib/schedule";
import { OPEN_REQUEST_STATUSES, REQUEST_PRIORITY_ORDER } from "@/components/status-badge";
import type { RequestPriority, RequestStatus } from "@/lib/types";

export type TodayRequest = {
  id: string;
  equipment_id: string;
  customer_id: string | null;
  location_id: string | null;
  status: RequestStatus;
  priority: RequestPriority;
  scheduled_for: string | null;
  assigned_to: string | null;
  contact_name: string;
  description: string;
  ai_summary: string | null;
  created_at: string;
  unread_customer_messages: number;
};

export type TodayGroups<T extends TodayRequest = TodayRequest> = {
  /** status "scheduled", scheduled sometime today (company time), earliest first. */
  visitsToday: T[];
  /** status "scheduled" but the scheduled time already passed (before today's start, company time) — visits a tech is now late for. */
  overdueVisits: T[];
  /** Open, assigned to `userId`, with no scheduled_for at all — "pick a time" work sitting on one person's plate. Highest priority first, then oldest first. */
  assignedUnscheduled: T[];
};

function priorityRank(priority: RequestPriority): number {
  const index = REQUEST_PRIORITY_ORDER.indexOf(priority);
  return index === -1 ? 0 : index;
}

/**
 * Buckets a company's requests into the three Today groups. A request lands
 * in at most one bucket — a request scheduled for a future day (not today,
 * not overdue) appears in neither, since that's Schedule's job, not Today's.
 * `userId` is whose "assigned to me" bucket this is (the signed-in
 * technician's profile id); requests assigned to someone else are simply
 * not in `assignedUnscheduled` (Today is a personal view, not a company-wide
 * one — see Q-47).
 */
export function groupTodayRequests<T extends TodayRequest>(
  requests: readonly T[],
  today: string,
  timeZone: string,
  userId: string
): TodayGroups<T> {
  const visitsToday: T[] = [];
  const overdueVisits: T[] = [];
  const assignedUnscheduled: T[] = [];

  for (const req of requests) {
    if (req.status === "scheduled" && req.scheduled_for) {
      const day = dateKeyInTimeZone(req.scheduled_for, timeZone);
      if (day === today) {
        visitsToday.push(req);
      } else if (day < today) {
        overdueVisits.push(req);
      }
      // day > today: a future visit — Schedule's job, not Today's.
      continue;
    }

    if (
      req.assigned_to === userId &&
      !req.scheduled_for &&
      (OPEN_REQUEST_STATUSES as readonly string[]).includes(req.status)
    ) {
      assignedUnscheduled.push(req);
    }
  }

  const byScheduledFor = (a: T, b: T) => (a.scheduled_for ?? "").localeCompare(b.scheduled_for ?? "");
  visitsToday.sort(byScheduledFor);
  overdueVisits.sort(byScheduledFor);
  assignedUnscheduled.sort(
    (a, b) => priorityRank(b.priority) - priorityRank(a.priority) || a.created_at.localeCompare(b.created_at)
  );

  return { visitsToday, overdueVisits, assignedUnscheduled };
}

// ----------------------------------------------------------------------------
// PM due this week
// ----------------------------------------------------------------------------

export type TodayMaintenanceSchedule = {
  id: string;
  equipment_id: string;
  name: string;
  active: boolean;
  next_due_on: string;
};

/** Active schedules due on or before `today + days` (default 7), earliest-due first — the same "due soon" horizon the Maintenance page uses, reused here for Today's PM card. */
export function pmDueWithin<T extends TodayMaintenanceSchedule>(
  schedules: readonly T[],
  today: string,
  days = 7
): T[] {
  const horizon = addDaysToDateOnly(today, days);
  return schedules
    .filter((s) => s.active && s.next_due_on <= horizon)
    .slice()
    .sort((a, b) => a.next_due_on.localeCompare(b.next_due_on));
}
