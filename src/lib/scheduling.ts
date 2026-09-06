// Timezone-aware helpers for scheduling-lite. A visit is stored as a UTC
// instant (service_requests.scheduled_for) but entered and read in the
// company's own zone (companies.timezone) — and the app renders on UTC
// servers, so every display must go through here rather than
// `toLocaleString()` with no zone. Pure functions, no I/O; tested in
// scheduling.test.ts.

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_ONLY = /^(\d{2}):(\d{2})$/;

/** Every wall-clock part of an instant in a zone, as numbers. */
function zonedParts(instant: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, number> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour === 24 ? 0 : parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

/** The zone's UTC offset in minutes at the given instant (positive east of UTC). */
export function timezoneOffsetMinutes(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/**
 * "2026-09-08" + "14:30" in America/Chicago → the ISO instant. Returns null
 * for malformed input or a zone the runtime doesn't know. Handles DST by
 * iterating the offset once (enough for every real zone).
 */
export function zonedDateTimeToIso(date: string, time: string, timeZone: string): string | null {
  const d = DATE_ONLY.exec(date.trim());
  const t = TIME_ONLY.exec(time.trim());
  if (!d || !t) return null;
  const [year, month, day] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const [hour, minute] = [Number(t[1]), Number(t[2])];
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  if (!isValidTimeZone(timeZone)) return null;

  const naive = Date.UTC(year, month - 1, day, hour, minute);
  let guess = naive - timezoneOffsetMinutes(new Date(naive), timeZone) * 60_000;
  // Second pass corrects a guess that landed on the other side of a DST switch.
  guess = naive - timezoneOffsetMinutes(new Date(guess), timeZone) * 60_000;

  const check = zonedParts(new Date(guess), timeZone);
  if (check.year !== year || check.month !== month || check.day !== day) return null;
  return new Date(guess).toISOString();
}

/** The `<input type="date">` / `<input type="time">` values for an instant in a zone. */
export function isoToZonedInputs(iso: string, timeZone: string): { date: string; time: string } | null {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime()) || !isValidTimeZone(timeZone)) return null;
  const p = zonedParts(instant, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** "Tue, Sep 8, 2:30 PM CDT" — how a visit time reads to a customer or a tech. Falls back to UTC on a bad zone. */
export function formatZonedDateTime(iso: string, timeZone: string, options: { withYear?: boolean } = {}): string {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return "";
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(options.withYear ? { year: "numeric" } : {}),
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(instant);
}

/** "Sep 8" / "Sep 8, 2027" — a date-only rendering in a zone. */
export function formatZonedDate(iso: string, timeZone: string): string {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return "";
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const sameYear = zonedParts(instant, zone).year === zonedParts(new Date(), zone).year;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(instant);
}

/** Whether the instant is in the past relative to `now`. */
export function isPastVisit(iso: string, now: Date = new Date()): boolean {
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && t < now.getTime();
}
