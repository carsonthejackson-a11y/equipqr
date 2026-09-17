// Pure helpers for the platform admin's per-company activation table
// (docs/QOL-CONTINUITY-BRIEF.md item 12): how long after signup each company
// reached its first real usage milestone. No I/O — src/app/admin/page.tsx
// does the (cross-company, service-role) fetching and passes plain rows in.

/** A row carrying a company id and one ISO timestamp to compare across rows. */
export type CompanyTimestamp = { company_id: string; at: string };

/**
 * The earliest `at` per `company_id`, given rows already sorted ascending by
 * `at` — every call site queries with `.order(<column>, { ascending: true
 * })`, so the first row seen for a company already IS its earliest, and a
 * later duplicate for the same company is ignored.
 */
export function earliestByCompany(rows: CompanyTimestamp[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const row of rows) {
    if (!result.has(row.company_id)) {
      result.set(row.company_id, row.at);
    }
  }
  return result;
}

/**
 * Whole days from `fromIso` to `toIso` (negative if `toIso` is earlier).
 * Null when either side is missing or unparseable, so a caller can render
 * "—" instead of a nonsense number.
 */
export function daysBetween(
  fromIso: string | null | undefined,
  toIso: string | null | undefined
): number | null {
  if (!fromIso || !toIso) return null;
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / 86_400_000);
}
