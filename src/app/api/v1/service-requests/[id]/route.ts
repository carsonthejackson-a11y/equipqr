// Security model: service-role client (`auth.ctx.admin`) with NO RLS on
// this request. Every query below is filtered by `auth.ctx.companyId` —
// that filter is the entire tenant isolation for this endpoint.
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emitRequestActivity } from "@/lib/events";
import { authenticateApiRequest } from "@/lib/api-auth";
import { notifyRequesterOfStatus } from "@/lib/email/request-status";
import { serverEnv } from "@/lib/env";
import { isPlanId, type PlanId } from "@/lib/plans";
import type {
  Company,
  RequestActivity,
  RequestPriority,
  RequestStatus,
  ServiceRequest,
} from "@/lib/types";
import {
  SERVICE_REQUEST_COLUMNS,
  findCompanyProfile,
  jsonData,
  jsonError,
  statusUrlFor,
} from "../../shared";

const VALID_STATUSES: RequestStatus[] = [
  "new",
  "in_progress",
  "scheduled",
  "on_hold",
  "resolved",
  "canceled",
];
const VALID_PRIORITIES: RequestPriority[] = ["low", "normal", "high", "urgent"];

/** Everything notifyRequesterOfStatus() needs that isn't already on the request row. */
type NotifyCompany = Pick<
  Company,
  "id" | "name" | "phone" | "sms_number" | "website" | "logo_path" | "brand_color" | "customer_updates_enabled"
>;

/**
 * Emails the requester that their request's status changed — the same
 * courtesy the dashboard's updateRequestStatus() extends, which the API used
 * to skip, leaving customers who submitted through a sticker in the dark
 * whenever staff drove the workflow from an integration instead.
 *
 * Best-effort and never awaited by the handler (see the `after()` call site):
 * a slow Resend call must not sit in front of the PATCH's response. The admin
 * client is fine for the `email_sent` activity row notifyRequesterOfStatus()
 * writes — emitRequestActivity() passes an explicit company_id.
 */
async function notifyRequesterFromApi(
  admin: SupabaseClient,
  companyId: string,
  updated: ServiceRequest,
  status: RequestStatus
) {
  const [{ data: company }, { data: equipment }, { data: flags }] = await Promise.all([
    admin
      .from("companies")
      .select("id, name, phone, sms_number, website, logo_path, brand_color, customer_updates_enabled")
      .eq("id", companyId)
      .maybeSingle<NotifyCompany>(),
    admin
      .from("equipment")
      .select("name")
      .eq("id", updated.equipment_id)
      .eq("company_id", companyId)
      .maybeSingle<{ name: string }>(),
    admin.rpc("get_company_plan_flags", { p_company_id: companyId }),
  ]);

  if (!company) return;

  const rawPlanId = (flags as { plan_id?: string } | null)?.plan_id;
  const planId: PlanId | null = isPlanId(rawPlanId) ? rawPlanId : null;

  await notifyRequesterOfStatus(admin, {
    request: updated,
    status,
    equipmentName: equipment?.name ?? "your equipment",
    company,
    planId,
    supabaseUrl: serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    // An API key isn't a person — there's no staff profile to attribute the
    // send to, and author_user_id is a profiles FK.
    actorUserId: null,
  });
}

async function loadRequest(admin: SupabaseClient, companyId: string, id: string) {
  const { data } = await admin
    .from("service_requests")
    .select(SERVICE_REQUEST_COLUMNS)
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
    .select(SERVICE_REQUEST_COLUMNS)
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

  if (hasStatus && existing.status !== updated.status) {
    const status = updated.status;
    after(async () => {
      await notifyRequesterFromApi(auth.ctx.admin, auth.ctx.companyId, updated, status);
    });
  }

  const { public_token, ...rest } = updated;
  return jsonData({ ...rest, status_url: statusUrlFor(public_token) });
}
