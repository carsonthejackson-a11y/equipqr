// Security model: service-role client (`auth.ctx.admin`) with NO RLS on
// this request. Every query below is filtered by `auth.ctx.companyId` —
// that filter is the entire tenant isolation for this endpoint.
import { authenticateApiRequest } from "@/lib/api-auth";
import { byCreatedAt, cursorFilter, decodeCursor, paginateRows, parseLimit } from "@/lib/api-pagination";
import type { Customer } from "@/lib/types";
import { jsonData, jsonError } from "../shared";

export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "read");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const limit = parseLimit(searchParams.get("limit"));
  const cursor = decodeCursor(searchParams.get("cursor"));

  let query = auth.ctx.admin
    .from("customers")
    .select("*")
    .eq("company_id", auth.ctx.companyId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (cursor) query = query.or(cursorFilter(cursor));

  const { data, error } = await query.limit(limit + 1).returns<Customer[]>();

  if (error) {
    return jsonError(error.message, 500);
  }

  const { rows, nextCursor } = paginateRows(data ?? [], limit, byCreatedAt);
  return jsonData(rows, { next_cursor: nextCursor });
}
