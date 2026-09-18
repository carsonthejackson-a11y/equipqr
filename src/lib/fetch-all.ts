// PostgREST caps every un-ranged select at the server's `max-rows` (1000 on
// Supabase) and returns the first page with a 200 — no error, no hint that
// rows were dropped. Anything that must see a company's WHOLE table (the CSV
// export) has to page explicitly.

export type PageResult<T> = { data: T[] | null; error: { message: string } | null };

/** The page size Supabase's PostgREST serves at most in one response. */
export const POSTGREST_MAX_ROWS = 1000;

/**
 * Collects every row of a query by asking for it one `.range(from, to)` page
 * at a time until a short page comes back. `page` must build a FRESH query
 * for each call (supabase-js builders are single-use thenables) and give it
 * a stable, total order (a timestamp plus an `id` tiebreak) so offset paging
 * never skips or repeats a row. `pageSize` must not exceed the server's
 * max-rows, or the first page would come back short and end the loop early.
 * Throws on the first query error.
 */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = POSTGREST_MAX_ROWS
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    for (const row of batch) rows.push(row);
    if (batch.length < pageSize) return rows;
  }
}
