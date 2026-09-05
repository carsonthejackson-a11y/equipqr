// Security model: service-role client (`auth.ctx.admin`) with NO RLS on
// this request. Every query below is filtered by `auth.ctx.companyId` —
// that filter is the entire tenant isolation for this endpoint.
import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api-auth";
import { jsonError } from "../shared";

export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "read");
  if (!auth.ok) return auth.response;

  const { data: company, error } = await auth.ctx.admin
    .from("companies")
    .select("id, name")
    .eq("id", auth.ctx.companyId)
    .maybeSingle<{ id: string; name: string }>();

  if (error || !company) {
    return jsonError("Company not found", 404);
  }

  // Not the `{ data, next_cursor }` list shape — /me is a single-object
  // status endpoint for testing a key, not a paginated collection.
  return NextResponse.json(
    { company, scopes: auth.ctx.scopes },
    { headers: { "Cache-Control": "no-store" } }
  );
}
