// Security model: service-role client (`auth.ctx.admin`) with NO RLS on
// this request. Every query below is filtered by `auth.ctx.companyId` —
// that filter is the entire tenant isolation for this endpoint.
import type { SupabaseClient } from "@supabase/supabase-js";
import { emitRequestActivity } from "@/lib/events";
import { authenticateApiRequest } from "@/lib/api-auth";
import type { RequestActivity, RequestPriority, RequestStatus, ServiceRequest } from "@/lib/types";
import { findCompanyProfile, jsonData, jsonError, statusUrlFor } from "../../shared";

const VALID_STATUSES: RequestStatus[] = [
  "new",
  "in_progress",
  "scheduled",
  "on_hold",
  "resolved",
  "canceled",
];
const VALID_PRIORITIES: RequestPriority[] = ["low", "normal", "high", "urgent"];

async function loadRequest(admin: SupabaseClient, companyId: string, id: string) {
  const { data } = await admin
    .from("service_requests")
    .select("*")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle<ServiceRequest>();
  return data;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiRequest(request, "read");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const serviceRequest = await loadRequest(auth.ctx.admin, auth.ctx.companyId, id);

  if (!serviceRequest) return jsonError("Service request not found", 404);

  const { data: activity } = await auth.ctx.admin
    .from("request_activity")
    .select("*")
    .eq("service_request_id", id)
    .eq("company_id", auth.ctx.companyId)
    .order("created_at", { ascending: true })
    .returns<RequestActivity[]>();

  const { public_token, ...rest } = serviceRequest;

  return jsonData({
    ...rest,
    status_url: statusUrlFor(public_token),
    // Both visibilities: an API key already has full staff-level access to
    // this company's data, same as the dashboard.
    activity: activity ?? [],
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiRequest(request, "write");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const existing = await loadRequest(auth.ctx.admin, auth.ctx.companyId, id);
  if (!existing) return jsonError("Service request not found", 404);

  const body = (await request.json().catch(() => null)) as {
    status?: unknown;
    priority?: unknown;
    assigned_to?: unknown;
  } | null;

  if (!body || typeof body !== "object") {
    return jsonError("Invalid JSON body", 400);
  }

  const hasStatus = "status" in body;
  const hasPriority = "priority" in body;
  const hasAssignedTo = "assigned_to" in body;

  if (!hasStatus && !hasPriority && !hasAssignedTo) {
    return jsonError("Provide at least one of: status, priority, assigned_to", 400);
  }

  const patch: Record<string, unknown> = {};

  if (hasStatus) {
    if (typeof body.status !== "string" || !VALID_STATUSES.includes(body.status as RequestStatus)) {
      return jsonError(`status must be one of: ${VALID_STATUSES.join(", ")}`, 400);
    }
    patch.status = body.status;
  }

  if (hasPriority) {
    if (typeof body.priority !== "string" || !VALID_PRIORITIES.includes(body.priority as RequestPriority)) {
      return jsonError(`priority must be one of: ${VALID_PRIORITIES.join(", ")}`, 400);
    }
    patch.priority = body.priority;
  }

  let assigneeName: string | null = null;
  if (hasAssignedTo) {
    if (body.assigned_to === null) {
      patch.assigned_to = null;
      patch.assigned_at = null;
    } else if (typeof body.assigned_to === "string") {
      const profile = await findCompanyProfile(auth.ctx.admin, auth.ctx.companyId, body.assigned_to);
      if (!profile) {
        return jsonError("assigned_to must be a profile id in your company", 400);
      }
      patch.assigned_to = profile.id;
      patch.assigned_at = new Date().toISOString();
      assigneeName = profile.full_name;
    } else {
      return jsonError("assigned_to must be a profile id string or null", 400);
    }
  }

  const { data: updated, error } = await auth.ctx.admin
    .from("service_requests")
    .update(patch)
    .eq("id", id)
    .eq("company_id", auth.ctx.companyId)
    .select("*")
    .maybeSingle<ServiceRequest>();

  if (error) return jsonError(error.message, 500);
  if (!updated) return jsonError("Service request not found", 404);

  const activityWrites: Promise<unknown>[] = [];

  if (hasStatus && existing.status !== updated.status) {
    activityWrites.push(
      emitRequestActivity(auth.ctx.admin, {
        companyId: auth.ctx.companyId,
        serviceRequestId: id,
        kind: "status_change",
        visibility: "customer",
        body: `Status changed to ${updated.status.replace(/_/g, " ")}`,
        metadata: { via: "api", from: existing.status, to: updated.status },
        authorKind: "system",
      })
    );
  }

  if (hasPriority && existing.priority !== updated.priority) {
    activityWrites.push(
      emitRequestActivity(auth.ctx.admin, {
        companyId: auth.ctx.companyId,
        serviceRequestId: id,
        kind: "priority_change",
        visibility: "internal",
        body: `Priority changed to ${updated.priority}`,
        metadata: { via: "api", from: existing.priority, to: updated.priority },
        authorKind: "system",
      })
    );
  }

  if (hasAssignedTo && existing.assigned_to !== updated.assigned_to) {
    activityWrites.push(
      emitRequestActivity(auth.ctx.admin, {
        companyId: auth.ctx.companyId,
        serviceRequestId: id,
        kind: "assignment",
        visibility: "internal",
        body: updated.assigned_to ? `Assigned to ${assigneeName ?? "a team member"}` : "Unassigned",
        metadata: { via: "api", from: existing.assigned_to, to: updated.assigned_to },
        authorKind: "system",
      })
    );
  }

  await Promise.all(activityWrites);

  const { public_token, ...rest } = updated;
  return jsonData({ ...rest, status_url: statusUrlFor(public_token) });
}
