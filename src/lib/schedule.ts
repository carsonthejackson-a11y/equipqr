// Pure date/time helpers for scheduling-lite (visit date/time in the
// company's timezone) and preventive-maintenance due dates. No new
// dependencies — everything here leans on `Intl.DateTimeFormat`, which is
// the only timezone-aware primitive Node/the browser ship.
//
// The trick used throughout: format a real instant (a UTC `Date`) using
// `Intl.DateTimeFormat` with a target `timeZone`, then re-parse those
// wall-clock digits as if they were UTC. The difference between that and the
// original instant is the zone's offset *at that instant* — which is enough
// to convert in either direction without a tz database dependency. This is
// off by an hour only in the ambiguous hour of a DST transition, which is an
// acceptable approximation for scheduling a service visit.

/** "YYYY-MM-DD" */
export type IsoDate = string;
/** "HH:MM", 24-hour */
export type IsoTime = string;

type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function zonedPartsAt(utcMs: number, timeZone: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(utcMs))) {
    map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    // Some environments render midnight as "24" even with hourCycle "h23".
    hour: Number(map.hour) % 24,
    minute: Number(map.minute),
    second: Number(map.second ?? "0"),
  };
}

/** The zone's UTC offset (ms) at a given instant: `zoned wall clock = utcMs + offset`. */
function tzOffsetMsAt(utcMs: number, timeZone: string): number {
  const p = zonedPartsAt(utcMs, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - utcMs;
}

/**
 * Converts a wall-clock date + time meant to be read in `timeZone` into a
 * UTC ISO instant. This is what a "schedule a visit for 2pm Tuesday, company
 * time" form submits.
 */
export function zonedWallTimeToUtcIso(date: IsoDate, time: IsoTime, timeZone: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const offsetMs = tzOffsetMsAt(guessUtcMs, timeZone);
  return new Date(guessUtcMs - offsetMs).toISOString();
}

/** Inverse of {@link zonedWallTimeToUtcIso} — for pre-filling a form from a stored instant. */
export function utcIsoToZonedParts(iso: string, timeZone: string): { date: IsoDate; time: IsoTime } {
  const p = zonedPartsAt(new Date(iso).getTime(), timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

/** The calendar date (in `timeZone`) that an instant falls on — used to place a visit in a week grid column. */
export function dateKeyInTimeZone(iso: string, timeZone: string): IsoDate {
  return utcIsoToZonedParts(iso, timeZone).date;
}

/** Today's date (in `timeZone`), as "YYYY-MM-DD". */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): IsoDate {
  return utcIsoToZonedParts(now.toISOString(), timeZone).date;
}

/** "Sep 6, 2026, 2:00 PM" style, in the given timezone. */
export function formatZonedDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso)
  );
}

/** "2:00 PM" style, in the given timezone. */
export function formatZonedTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(
    new Date(iso)
  );
}

/** "45m", "1h", "1h 30m" — for a visit-duration chip. */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** "Sep 6, 2026" from a plain "YYYY-MM-DD" date column (no timezone conversion — the value is already a calendar date). */
export function formatDateOnly(date: IsoDate): string {
  const d = new Date(`${date}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(
    d
  );
}

/** "Mon, Sep 7" — week-grid column header from a "YYYY-MM-DD" date. */
export function formatWeekdayLabel(date: IsoDate): string {
  const d = new Date(`${date}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(
    d
  );
}

/** Adds N whole days to a "YYYY-MM-DD" date, returning the same format. Calendar-date arithmetic — no timezone involved. */
export function addDaysToDateOnly(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** True when a "YYYY-MM-DD" due date is on or before another "YYYY-MM-DD" date (both calendar dates, no timezone). */
export function isDateOnOrBefore(date: IsoDate, referenceDate: IsoDate): boolean {
  return date <= referenceDate;
}

/**
 * Monday of the week containing `date` ("YYYY-MM-DD" in, "YYYY-MM-DD" out).
 * Calendar-date arithmetic done in UTC so it's independent of the caller's
 * own timezone — the company's timezone only matters for placing a specific
 * *instant* (scheduled_for) into a day column, not for which date starts
 * the week grid.
 */
export function startOfWeek(date: IsoDate): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const daysSinceMonday = (dow + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d.toISOString().slice(0, 10);
}

/** The 7 "YYYY-MM-DD" dates of the week starting at `weekStart` (must already be a Monday). */
export function weekDates(weekStart: IsoDate): IsoDate[] {
  return Array.from({ length: 7 }, (_, i) => addDaysToDateOnly(weekStart, i));
}

/** Adds whole minutes to a UTC ISO instant. */
export function addMinutesIso(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}
