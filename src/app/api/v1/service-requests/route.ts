// Security model: service-role client (`auth.ctx.admin`) with NO RLS on
// this request. Every query below is filtered by `auth.ctx.companyId` —
// that filter is the entire tenant isolation for this endpoint.
import { authenticateApiRequest } from "@/lib/api-auth";
import { byCreatedAt, cursorFilter, decodeCursor, paginateRows, parseLimit } from "@/lib/api-pagination";
import type { ServiceRequest } from "@/lib/types";
import { SERVICE_REQUEST_COLUMNS, jsonData, jsonError, statusUrlFor } from "../shared";

export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "read");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const priority = searchParams.get("priority");
  const equipmentId = searchParams.get("equipment_id");
  const customerId = searchParams.get("customer_id");
  const updatedSince = searchParams.get("updated_since");
  const limit = parseLimit(searchParams.get("limit"));
  const cursor = decodeCursor(searchParams.get("cursor"));

  let query = auth.ctx.admin
    .from("service_requests")
    .select(SERVICE_REQUEST_COLUMNS)
    .eq("company_id", auth.ctx.companyId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (status) query = query.eq("status", status);
  if (priority) query = query.eq("priority", priority);
  if (equipmentId) query = query.eq("equipment_id", equipmentId);
  if (customerId) query = query.eq("customer_id", customerId);
  if (updatedSince) query = query.gte("updated_at", updatedSince);
  if (cursor) query = query.or(cursorFilter(cursor));

  const { data, error } = await query.limit(limit + 1).returns<ServiceRequest[]>();

  if (error) {
    return jsonError(error.message, 500);
  }

  const { rows, nextCursor } = paginateRows(data ?? [], limit, byCreatedAt);

  return jsonData(
    rows.map(({ public_token, ...rest }) => ({ ...rest, status_url: statusUrlFor(public_token) })),
    { next_cursor: nextCursor }
  );
}
