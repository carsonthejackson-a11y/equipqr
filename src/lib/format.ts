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
