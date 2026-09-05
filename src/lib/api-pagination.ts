// Cursor pagination for /api/v1/*: keyset (not offset) paging, sorted by
// some timestamp column (created_at for most tables, scanned_at for
// scan_events) descending with `id` as a tie-breaker. Encoding the cursor as
// an opaque base64url token — rather than exposing the raw sort value/id as
// query params — keeps the wire format free to change later.

export type Cursor = { sortValue: string; id: string };

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 200;

/** Encodes a cursor into the opaque token returned as `next_cursor`. */
export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

/** Decodes a `cursor` query param. Returns null for anything missing, malformed, or tampered with — callers should treat that as "start from the beginning" rather than erroring, since a stale/garbage cursor is a client bug, not a reason to fail the request. */
export function decodeCursor(value: string | null | undefined): Cursor | null {
  if (!value) return null;
  try {
    const json = Buffer.from(value, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as Record<string, unknown>).sortValue === "string" &&
      typeof (parsed as Record<string, unknown>).id === "string"
    ) {
      return { sortValue: (parsed as Cursor).sortValue, id: (parsed as Cursor).id };
    }
    return null;
  } catch {
    return null;
  }
}

/** Clamps a `?limit=` query param to (0, MAX_PAGE_LIMIT], defaulting to DEFAULT_PAGE_LIMIT for anything missing or invalid. */
export function parseLimit(raw: string | null | undefined): number {
  const n = Number(raw);
  if (!raw || !Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_LIMIT;
  return Math.min(Math.floor(n), MAX_PAGE_LIMIT);
}

/**
 * PostgREST `.or()` filter string for "rows strictly after this cursor" when
 * sorted `<column> desc, id desc`. Pass the result straight to
 * `.or(cursorFilter(cursor))` — supabase-js wraps it in `or(...)` itself.
 * `column` defaults to "created_at", the sort column every list endpoint
 * uses except scan_events (which sorts on "scanned_at").
 */
export function cursorFilter(cursor: Cursor, column: string = "created_at"): string {
  const { sortValue, id } = cursor;
  return `${column}.lt.${sortValue},and(${column}.eq.${sortValue},id.lt.${id})`;
}

/**
 * Given rows fetched with `limit + 1` (sorted `<sort column> desc, id
 * desc`), trims back to `limit` and derives `next_cursor` from the last row
 * of the page when there was an extra row (i.e. more pages exist).
 * `getSortValue` extracts the value of whatever column the query was
 * sorted on (created_at for most endpoints, scanned_at for scan_events).
 */
export function paginateRows<T extends { id: string }>(
  rows: T[],
  limit: number,
  getSortValue: (row: T) => string
): { rows: T[]; nextCursor: string | null } {
  if (rows.length > limit) {
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return { rows: page, nextCursor: encodeCursor({ sortValue: getSortValue(last), id: last.id }) };
  }
  return { rows, nextCursor: null };
}

/** `getSortValue` for the common case: the row has a `created_at` column. */
export function byCreatedAt<T extends { created_at: string }>(row: T): string {
  return row.created_at;
}
