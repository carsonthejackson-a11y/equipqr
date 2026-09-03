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
