// Security model: service-role client (`auth.ctx.admin`) with NO RLS on
// this request. Every query below is filtered by `auth.ctx.companyId` —
// that filter is the entire tenant isolation for this endpoint.
import { authenticateApiRequest } from "@/lib/api-auth";
import type { Customer } from "@/lib/types";
import { jsonData, jsonError } from "../../shared";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiRequest(request, "read");
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const { data: customer, error } = await auth.ctx.admin
    .from("customers")
    .select("*")
    .eq("id", id)
    .eq("company_id", auth.ctx.companyId)
    .maybeSingle<Customer>();

  if (error) return jsonError(error.message, 500);
  if (!customer) return jsonError("Customer not found", 404);

  return jsonData(customer);
}
