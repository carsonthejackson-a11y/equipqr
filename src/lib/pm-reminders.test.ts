import { describe, expect, it } from "vitest";
import {
  addDays,
  describeDue,
  groupByCompany,
  isPmFilter,
  pmFilterRange,
  selectDueUnits,
  todayDateOnly,
  type PmCandidate,
} from "@/lib/pm-reminders";

const now = new Date("2026-09-05T12:00:00Z");
const today = "2026-09-05";

describe("date helpers", () => {
  it("takes the UTC day", () => {
    expect(todayDateOnly(new Date("2026-09-05T23:59:59Z"))).toBe("2026-09-05");
    expect(todayDateOnly(new Date("2026-09-06T00:00:01Z"))).toBe("2026-09-06");
  });

  it("adds and subtracts whole days across month and year boundaries", () => {
    expect(addDays("2026-09-05", 7)).toBe("2026-09-12");
    expect(addDays("2026-09-05", -5)).toBe("2026-08-31");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
  });
});

describe("pmFilterRange", () => {
  it("accepts the documented values only", () => {
    expect(isPmFilter("overdue")).toBe(true);
    expect(isPmFilter("none")).toBe(true);
    expect(isPmFilter("soon")).toBe(false);
    expect(isPmFilter(undefined)).toBe(false);
  });

  it("maps overdue to strictly-before-today", () => {
    expect(pmFilterRange("overdue", now)).toEqual({ lte: "2026-09-04" });
  });

  it("maps due_soon to today+14, including overdue units", () => {
    expect(pmFilterRange("due_soon", now)).toEqual({ lte: "2026-09-19" });
  });

  it("maps scheduled to beyond the due-soon window", () => {
    expect(pmFilterRange("scheduled", now)).toEqual({ gte: "2026-09-20" });
  });

  it("maps none to a null check and any/unknown to no filter", () => {
    expect(pmFilterRange("none", now)).toEqual({ isNull: true });
    expect(pmFilterRange("any", now)).toBeNull();
    expect(pmFilterRange(undefined, now)).toBeNull();
    expect(pmFilterRange("garbage", now)).toBeNull();
  });

  it("splits the day line so a unit lands in exactly one of overdue / due_soon / scheduled", () => {
    const overdue = pmFilterRange("overdue", now)!;
    const soon = pmFilterRange("due_soon", now)!;
    const later = pmFilterRange("scheduled", now)!;
    expect(addDays(overdue.lte!, 1)).toBe(today);
    expect(addDays(soon.lte!, 1)).toBe(later.gte);
  });
});

function unit(overrides: Partial<PmCandidate> & { id: string }): PmCandidate {
  return {
    company_id: "co-a",
    name: overrides.id,
    customer_id: null,
    location: null,
    status: "active",
    next_service_due_on: "2026-09-10",
    pm_reminder_sent_for: null,
    ...overrides,
  };
}

describe("selectDueUnits", () => {
  it("keeps units due inside the 7-day window, soonest first", () => {
    const rows = [
      unit({ id: "in-7", next_service_due_on: "2026-09-12" }),
      unit({ id: "overdue", next_service_due_on: "2026-08-20" }),
      unit({ id: "today", next_service_due_on: "2026-09-05" }),
      unit({ id: "in-8", next_service_due_on: "2026-09-13" }),
    ];
    expect(selectDueUnits(rows, today).map((r) => r.id)).toEqual(["overdue", "today", "in-7"]);
  });

  it("drops units without a date and units off the route", () => {
    const rows = [
      unit({ id: "no-date", next_service_due_on: null }),
      unit({ id: "retired", status: "retired" }),
      unit({ id: "oos", status: "out_of_service" }),
      unit({ id: "needs", status: "needs_service" }),
    ];
    expect(selectDueUnits(rows, today).map((r) => r.id)).toEqual(["needs"]);
  });

  it("skips units already reminded for this due date, but not for an older one", () => {
    const rows = [
      unit({ id: "sent", pm_reminder_sent_for: "2026-09-10" }),
      unit({ id: "moved", pm_reminder_sent_for: "2026-06-10" }),
      unit({ id: "fresh", pm_reminder_sent_for: null }),
    ];
    expect(selectDueUnits(rows, today).map((r) => r.id)).toEqual(["moved", "fresh"]);
  });
});

describe("groupByCompany", () => {
  it("buckets rows by company in first-seen order and keeps row order", () => {
    const rows = [
      unit({ id: "a1", company_id: "co-a" }),
      unit({ id: "b1", company_id: "co-b" }),
      unit({ id: "a2", company_id: "co-a" }),
    ];
    const groups = groupByCompany(rows);
    expect([...groups.keys()]).toEqual(["co-a", "co-b"]);
    expect(groups.get("co-a")?.map((r) => r.id)).toEqual(["a1", "a2"]);
    expect(groups.get("co-b")?.map((r) => r.id)).toEqual(["b1"]);
  });
});

describe("describeDue", () => {
  it("reads naturally either side of today", () => {
    expect(describeDue("2026-09-05", today)).toBe("due today");
    expect(describeDue("2026-09-06", today)).toBe("due in 1 day");
    expect(describeDue("2026-09-12", today)).toBe("due in 7 days");
    expect(describeDue("2026-09-04", today)).toBe("overdue by 1 day");
    expect(describeDue("2026-08-20", today)).toBe("overdue by 16 days");
  });
});
