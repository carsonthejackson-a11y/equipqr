import { describe, expect, it } from "vitest";
import { groupTodayRequests, pmDueWithin, type TodayMaintenanceSchedule, type TodayRequest } from "./today-data";

const TODAY = "2026-09-16"; // a Wednesday
const TZ = "America/Chicago"; // UTC-5 in September (CDT)
const ME = "tech-1";

let seq = 0;
function req(overrides: Partial<TodayRequest>): TodayRequest {
  seq += 1;
  return {
    id: `req-${seq}`,
    equipment_id: "eq-1",
    customer_id: null,
    location_id: null,
    status: "new",
    priority: "normal",
    scheduled_for: null,
    assigned_to: null,
    contact_name: "Dana",
    description: "Won't hold pressure",
    ai_summary: null,
    created_at: "2026-09-10T12:00:00.000Z",
    unread_customer_messages: 0,
    ...overrides,
  };
}

describe("groupTodayRequests", () => {
  it("puts a visit scheduled for later today (company time) into visitsToday", () => {
    // 3pm Central on Sep 16 = 20:00 UTC, still Sep 16 in Chicago.
    const visit = req({ status: "scheduled", scheduled_for: "2026-09-16T20:00:00.000Z" });
    const groups = groupTodayRequests([visit], TODAY, TZ, ME);
    expect(groups.visitsToday).toEqual([visit]);
    expect(groups.overdueVisits).toEqual([]);
    expect(groups.assignedUnscheduled).toEqual([]);
  });

  it("does not misclassify a late-evening company-time visit as tomorrow (the Q-02 off-by-one bug class)", () => {
    // 9:39 PM Central on Sep 16 is 02:39 UTC on Sep 17 — a naive UTC-date
    // grouping would push this into "tomorrow" or treat it as overdue by the
    // time Today re-renders; company-zone grouping must keep it as "today".
    const lateVisit = req({ status: "scheduled", scheduled_for: "2026-09-17T02:39:00.000Z" });
    const groups = groupTodayRequests([lateVisit], TODAY, TZ, ME);
    expect(groups.visitsToday).toEqual([lateVisit]);
    expect(groups.overdueVisits).toEqual([]);
  });

  it("puts a scheduled visit whose company-local day is before today into overdueVisits", () => {
    const stale = req({ status: "scheduled", scheduled_for: "2026-09-14T15:00:00.000Z" });
    const groups = groupTodayRequests([stale], TODAY, TZ, ME);
    expect(groups.overdueVisits).toEqual([stale]);
    expect(groups.visitsToday).toEqual([]);
  });

  it("excludes a scheduled visit for a future day from every bucket", () => {
    const future = req({ status: "scheduled", scheduled_for: "2026-09-20T15:00:00.000Z" });
    const groups = groupTodayRequests([future], TODAY, TZ, ME);
    expect(groups.visitsToday).toEqual([]);
    expect(groups.overdueVisits).toEqual([]);
    expect(groups.assignedUnscheduled).toEqual([]);
  });

  it("puts an open, unscheduled request assigned to me into assignedUnscheduled", () => {
    const mine = req({ status: "in_progress", assigned_to: ME });
    const groups = groupTodayRequests([mine], TODAY, TZ, ME);
    expect(groups.assignedUnscheduled).toEqual([mine]);
  });

  it("excludes unscheduled work assigned to someone else, or to no one", () => {
    const someoneElse = req({ status: "new", assigned_to: "tech-2" });
    const unassigned = req({ status: "new", assigned_to: null });
    const groups = groupTodayRequests([someoneElse, unassigned], TODAY, TZ, ME);
    expect(groups.assignedUnscheduled).toEqual([]);
  });

  it("excludes closed work assigned to me from assignedUnscheduled", () => {
    const resolved = req({ status: "resolved", assigned_to: ME });
    const canceled = req({ status: "canceled", assigned_to: ME });
    const groups = groupTodayRequests([resolved, canceled], TODAY, TZ, ME);
    expect(groups.assignedUnscheduled).toEqual([]);
  });

  it("never double-counts a request into two buckets", () => {
    // A "scheduled" status with a scheduled_for always resolves through the
    // visit branch, even if it also happens to be assigned to me.
    const scheduledToMe = req({ status: "scheduled", scheduled_for: "2026-09-16T15:00:00.000Z", assigned_to: ME });
    const groups = groupTodayRequests([scheduledToMe], TODAY, TZ, ME);
    expect(groups.visitsToday).toEqual([scheduledToMe]);
    expect(groups.assignedUnscheduled).toEqual([]);
  });

  it("orders visitsToday and overdueVisits earliest first", () => {
    const later = req({ status: "scheduled", scheduled_for: "2026-09-16T21:00:00.000Z" });
    const earlier = req({ status: "scheduled", scheduled_for: "2026-09-16T14:00:00.000Z" });
    const groups = groupTodayRequests([later, earlier], TODAY, TZ, ME);
    expect(groups.visitsToday).toEqual([earlier, later]);
  });

  it("orders assignedUnscheduled by priority (urgent first), then oldest first within a priority", () => {
    const low = req({ assigned_to: ME, priority: "low", created_at: "2026-09-01T00:00:00.000Z" });
    const urgentNew = req({ assigned_to: ME, priority: "urgent", created_at: "2026-09-15T00:00:00.000Z" });
    const urgentOld = req({ assigned_to: ME, priority: "urgent", created_at: "2026-09-10T00:00:00.000Z" });
    const groups = groupTodayRequests([low, urgentNew, urgentOld], TODAY, TZ, ME);
    expect(groups.assignedUnscheduled).toEqual([urgentOld, urgentNew, low]);
  });
});

describe("pmDueWithin", () => {
  function schedule(overrides: Partial<TodayMaintenanceSchedule>): TodayMaintenanceSchedule {
    return { id: "ms-1", equipment_id: "eq-1", name: "Descale", active: true, next_due_on: TODAY, ...overrides };
  }

  it("includes a schedule due today", () => {
    expect(pmDueWithin([schedule({ next_due_on: TODAY })], TODAY)).toHaveLength(1);
  });

  it("includes an overdue schedule", () => {
    expect(pmDueWithin([schedule({ next_due_on: "2026-09-01" })], TODAY)).toHaveLength(1);
  });

  it("includes a schedule due within the next 7 days and excludes one due later", () => {
    const soon = schedule({ id: "soon", next_due_on: "2026-09-20" });
    const later = schedule({ id: "later", next_due_on: "2026-09-25" });
    const result = pmDueWithin([soon, later], TODAY);
    expect(result.map((s) => s.id)).toEqual(["soon"]);
  });

  it("excludes a paused (inactive) schedule even if overdue", () => {
    const paused = schedule({ active: false, next_due_on: "2026-09-01" });
    expect(pmDueWithin([paused], TODAY)).toEqual([]);
  });

  it("orders results by due date, earliest first", () => {
    const later = schedule({ id: "later", next_due_on: "2026-09-18" });
    const overdue = schedule({ id: "overdue", next_due_on: "2026-09-10" });
    const result = pmDueWithin([later, overdue], TODAY);
    expect(result.map((s) => s.id)).toEqual(["overdue", "later"]);
  });

  it("respects a custom horizon", () => {
    const inTenDays = schedule({ next_due_on: "2026-09-26" });
    expect(pmDueWithin([inTenDays], TODAY)).toEqual([]);
    expect(pmDueWithin([inTenDays], TODAY, 14)).toHaveLength(1);
  });
});
