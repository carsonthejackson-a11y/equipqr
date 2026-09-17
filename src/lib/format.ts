const UNITS: { limit: number; divisor: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { limit: 60, divisor: 1, unit: "second" },
  { limit: 3600, divisor: 60, unit: "minute" },
  { limit: 86_400, divisor: 3600, unit: "hour" },
  { limit: 604_800, divisor: 86_400, unit: "day" },
  { limit: 2_629_800, divisor: 604_800, unit: "week" },
  { limit: 31_557_600, divisor: 2_629_800, unit: "month" },
  { limit: Infinity, divisor: 31_557_600, unit: "year" },
];

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "3 hours ago", "yesterday", "in 2 days", etc. from an ISO timestamp. */
export function formatRelativeTime(iso: string): string {
  const diffSeconds = (new Date(iso).getTime() - Date.now()) / 1000;
  const absSeconds = Math.abs(diffSeconds);

  const bucket = UNITS.find((u) => absSeconds < u.limit) ?? UNITS[UNITS.length - 1];
  const value = Math.round(diffSeconds / bucket.divisor);

  // Round-to-zero (e.g. 40s ago) would otherwise print "in 0 seconds".
  return rtf.format(value === 0 ? (diffSeconds < 0 ? -1 : 1) : value, bucket.unit);
}

const BYTE_UNITS = ["KB", "MB", "GB", "TB"];

/** "512 B", "24.5 KB", "1.2 MB" — file sizes for document lists. Renders "—" for unknown sizes. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;

  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${BYTE_UNITS[unitIndex]}`;
}

// ----------------------------------------------------------------------------
// Company-timezone formatting (QoL & continuity pass — fixes C1-22/Q-01/Q-02:
// dashboard timestamps and emails rendering in the server/process's own
// timezone instead of `companies.timezone`). Every helper below takes the
// IANA zone as an explicit argument and formats through `Intl.DateTimeFormat`
// with that zone — never through `Date#toLocaleString()` or any other API
// that would silently fall back to the machine's own timezone — so they're
// equally correct from a server component (pass `company.timezone`) and a
// client component (pass a `timeZone` prop down from one). Prefer
// src/lib/company-formatters.ts's `companyFormatters()` over calling these
// one at a time when you're formatting more than one timestamp for the same
// company.
// ----------------------------------------------------------------------------

/** `companies.timezone`'s own DB default (`NOT NULL DEFAULT 'America/Chicago'`) — the fallback every helper below uses for a missing/invalid zone. */
export const DEFAULT_COMPANY_TIME_ZONE = "America/Chicago";

/** "auto" shows the year only when it differs from the current year in the target zone; "always"/"never" force it on or off. */
export type CompanyYearMode = "auto" | "always" | "never";

/**
 * Validates an IANA timezone name, falling back to
 * {@link DEFAULT_COMPANY_TIME_ZONE} when `tz` is missing or isn't a zone
 * `Intl` recognises (detected by constructing an `Intl.DateTimeFormat` in a
 * try/catch — the constructor throws `RangeError` for an invalid zone
 * eagerly, before any formatting happens). `companies.timezone` is `NOT
 * NULL` in the DB, so this mostly guards a stale client-cached payload or a
 * hand-edited value; every formatter below already calls this internally,
 * so most callers never need it directly.
 */
export function safeTimeZone(tz: string | null | undefined): string {
  if (tz) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return tz;
    } catch {
      // Not a zone Intl recognises — fall through to the default.
    }
  }
  return DEFAULT_COMPANY_TIME_ZONE;
}

/** `Intl.DateTimeFormat(...).formatToParts()` flattened to a `{ [partType]: value }` map, for the zoned-formatting helpers below. */
function zonedPartsMap(iso: string, timeZone: string, options: Intl.DateTimeFormatOptions): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-US", { ...options, timeZone }).formatToParts(new Date(iso));
  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  return map;
}

function zonedYear(iso: string, timeZone: string): number {
  return Number(zonedPartsMap(iso, timeZone, { year: "numeric" }).year);
}

/** Resolves a {@link CompanyYearMode} against `iso` — "auto" compares its calendar year in `timeZone` against *today's* calendar year in that same zone. */
function shouldIncludeYear(iso: string, timeZone: string, mode: CompanyYearMode): boolean {
  if (mode === "always") return true;
  if (mode === "never") return false;
  return zonedYear(iso, timeZone) !== zonedYear(new Date().toISOString(), timeZone);
}

/**
 * "Sep 15, 7:59 PM" — date + time (no seconds) in the company's zone, for
 * request lists, activity timelines and anywhere else a compact combined
 * timestamp is shown. `opts.year` defaults to "auto" (see
 * {@link CompanyYearMode}); `opts.zone: true` appends the short zone name
 * ("Sep 15, 7:59 PM CDT") — turn it on for anything a customer/vendor might
 * read outside the company's own timezone (emails, the public status page).
 */
export function formatCompanyDateTime(
  iso: string,
  timeZone: string,
  opts: { year?: CompanyYearMode; zone?: boolean } = {}
): string {
  const zone = safeTimeZone(timeZone);
  const p = zonedPartsMap(iso, zone, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
  const datePart = shouldIncludeYear(iso, zone, opts.year ?? "auto") ? `${p.month} ${p.day}, ${p.year}` : `${p.month} ${p.day}`;
  const timePart = `${p.hour}:${p.minute} ${p.dayPeriod}`;
  return opts.zone ? `${datePart}, ${timePart} ${p.timeZoneName}` : `${datePart}, ${timePart}`;
}

/**
 * "Sep 15" / "Sep 15, 2025" — the CALENDAR DATE AS READ IN THE COMPANY ZONE,
 * not UTC and not the server's own zone: a 9:39 PM Central close-out on
 * Sep 15 must read "Sep 15" here even though the same instant is already
 * Sep 16 in UTC (the bug this fixes — see the module comment above). Use
 * for "Last serviced", due dates and anywhere only the date matters.
 * `opts.year` defaults to "auto" (see {@link CompanyYearMode}).
 */
export function formatCompanyDate(iso: string, timeZone: string, opts: { year?: CompanyYearMode } = {}): string {
  const zone = safeTimeZone(timeZone);
  const p = zonedPartsMap(iso, zone, { month: "short", day: "numeric", year: "numeric" });
  return shouldIncludeYear(iso, zone, opts.year ?? "auto") ? `${p.month} ${p.day}, ${p.year}` : `${p.month} ${p.day}`;
}

/**
 * "10:00 AM" / "10:00 AM CDT" — just the wall-clock time in the company's
 * zone (no date), for a visit's time chip, a schedule grid cell, etc.
 * `opts.zone: true` appends the short zone name.
 */
export function formatCompanyTime(iso: string, timeZone: string, opts: { zone?: boolean } = {}): string {
  const zone = safeTimeZone(timeZone);
  const p = zonedPartsMap(iso, zone, { hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" });
  const time = `${p.hour}:${p.minute} ${p.dayPeriod}`;
  return opts.zone ? `${time} ${p.timeZoneName}` : time;
}

/**
 * "Wednesday, September 16 at 10:00 AM CDT" — the long form for
 * transactional emails (visit reminders, dispatch notices, resolution
 * emails): a recipient reading their inbox has no other context for which
 * timezone a bare "10:00 AM" means, so this always spells out the zone —
 * there's no `opts.zone` to turn it off, and no year (emails are always
 * about something happening now/soon).
 */
export function formatCompanyLongDateTime(iso: string, timeZone: string): string {
  const zone = safeTimeZone(timeZone);
  const p = zonedPartsMap(iso, zone, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
  return `${p.weekday}, ${p.month} ${p.day} at ${p.hour}:${p.minute} ${p.dayPeriod} ${p.timeZoneName}`;
}

/** "CDT" / "CST" — the short zone abbreviation in effect for `timeZone` AT `iso` (the same zone can abbreviate differently across a DST transition). */
export function timeZoneShortName(iso: string, timeZone: string): string {
  const zone = safeTimeZone(timeZone);
  return zonedPartsMap(iso, zone, { timeZoneName: "short" }).timeZoneName ?? zone;
}
