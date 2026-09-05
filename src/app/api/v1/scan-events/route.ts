// Security model: service-role client (`auth.ctx.admin`) with NO RLS on
// this request. Every query below is filtered by `auth.ctx.companyId` —
// that filter is the entire tenant isolation for this endpoint.
import { authenticateApiRequest } from "@/lib/api-auth";
import { cursorFilter, decodeCursor, paginateRows, parseLimit } from "@/lib/api-pagination";
import type { ScanEvent } from "@/lib/types";
import { jsonData, jsonError } from "../shared";

const SORT_COLUMN = "scanned_at";
const DEFAULT_WINDOW_DAYS = 90;

// scan_events has no `created_at` of its own — it sorts (and paginates) on
// `scanned_at` instead, so this is the one list endpoint that passes a
// custom column into cursorFilter()/paginateRows().
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "read");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const equipmentId = searchParams.get("equipment_id");
  const since =
    searchParams.get("since") ??
    new Date(Date.now() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const limit = parseLimit(searchParams.get("limit"));
  const cursor = decodeCursor(searchParams.get("cursor"));

  let query = auth.ctx.admin
    .from("scan_events")
    .select("*")
    .eq("company_id", auth.ctx.companyId)
    .gte("scanned_at", since)
    .order("scanned_at", { ascending: false })
    .order("id", { ascending: false });

  if (equipmentId) query = query.eq("equipment_id", equipmentId);
  if (cursor) query = query.or(cursorFilter(cursor, SORT_COLUMN));

  const { data, error } = await query.limit(limit + 1).returns<ScanEvent[]>();

  if (error) {
    return jsonError(error.message, 500);
  }

  const { rows, nextCursor } = paginateRows(data ?? [], limit, (row) => row.scanned_at);
  return jsonData(rows, { next_cursor: nextCursor });
}
