// Pure helpers behind the schedule-visit dialog. Kept out of the client
// component so they can be unit-tested and so the `new Date()` calls live in
// plain functions rather than in a component body.

import { isValidTimeZone, isoToZonedInputs } from "@/lib/scheduling";

const DEFAULT_TIME = "09:00";

/** Day of week (0 = Sunday) for a YYYY-MM-DD string, independent of the runtime zone. */
function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/**
 * The dialog's starting values when no visit exists yet: the next weekday
 * (strictly after "today" in the company's zone) at 09:00. Sunday → Monday,
 * Friday → Monday, Wednesday → Thursday.
 */
export function defaultVisitInputs(timeZone: string, now: Date = new Date()): { date: string; time: string } {
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const today = isoToZonedInputs(now.toISOString(), zone)?.date ?? now.toISOString().slice(0, 10);
  let date = addDays(today, 1);
  while (weekdayOf(date) === 0 || weekdayOf(date) === 6) {
    date = addDays(date, 1);
  }
  return { date, time: DEFAULT_TIME };
}

/**
 * "Central Time (Chicago)" from "America/Chicago" — the helper text under
 * the date/time inputs. Uses the zone's long name at `instant` with the
 * Standard/Daylight qualifier dropped; falls back to the IANA id with
 * underscores removed when the runtime only knows a GMT offset.
 */
export function timezoneLabel(timeZone: string, instant: Date = new Date()): string {
  const plain = timeZone.replace(/_/g, " ");
  if (!isValidTimeZone(timeZone)) return plain;
  const city = plain.split("/").pop() ?? plain;
  let longName: string | undefined;
  try {
    longName = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "long" })
      .formatToParts(instant)
      .find((p) => p.type === "timeZoneName")?.value;
  } catch {
    longName = undefined;
  }
  if (!longName || /^GMT|^UTC/.test(longName)) return plain;
  const generic = longName.replace(/\b(Standard|Daylight|Summer) /, "");
  return generic === city ? generic : `${generic} (${city})`;
}
