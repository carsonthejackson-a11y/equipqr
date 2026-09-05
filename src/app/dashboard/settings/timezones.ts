// Timezone options for the company settings form. A short curated list of
// common US zones up top (most EquipQR companies are US-based field-service
// shops), then every other IANA zone `Intl.supportedValuesOf` knows about —
// this runs server-side only (inside the settings page's server component),
// so there's no bundle-size cost to listing all of them.

export const COMMON_US_TIMEZONES: { value: string; label: string }[] = [
  { value: "America/New_York", label: "Eastern Time (New York)" },
  { value: "America/Chicago", label: "Central Time (Chicago)" },
  { value: "America/Denver", label: "Mountain Time (Denver)" },
  { value: "America/Phoenix", label: "Mountain Time, no DST (Phoenix)" },
  { value: "America/Los_Angeles", label: "Pacific Time (Los Angeles)" },
  { value: "America/Anchorage", label: "Alaska Time (Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (Honolulu)" },
];

const COMMON_VALUES = new Set(COMMON_US_TIMEZONES.map((z) => z.value));

/** Every IANA zone name the runtime knows about, minus the ones already in the common list, sorted. */
export function allTimezones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone")
      .filter((tz) => !COMMON_VALUES.has(tz))
      .sort();
  } catch {
    // Some runtimes (very old Node) lack Intl.supportedValuesOf. The common
    // list above still covers the overwhelming majority of companies.
    return [];
  }
}

export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
