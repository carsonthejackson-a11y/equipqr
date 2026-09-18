// Shared helpers for /api/v1/* route handlers. Every handler in this
// directory:
//
//   1. Starts with `const auth = await authenticateApiRequest(request, scope);
//      if (!auth.ok) return auth.response;`
//   2. Uses `auth.ctx.admin` (the service-role client) filtered by
//      `auth.ctx.companyId` on EVERY query. There is no RLS on an API-key
//      request — the service role bypasses it entirely — so companyId
//      scoping here IS the tenant isolation. Forgetting a `.eq("company_id",
//      auth.ctx.companyId)` on any query is a cross-tenant data leak.
//
// This file has no DB access of its own — just response shaping and the bits
// of filter parsing shared by every handler. List endpoints apply cursor
// pagination inline (see any route.ts here for the pattern) rather than
// through a generic helper, since Supabase's query builder types don't
// compose well through one.

import { NextResponse } from "next/server";
import { companyAssetUrl } from "@/lib/branding";
import { getEquipmentPublicUrl, getRequestStatusUrl } from "@/lib/qr";
import { serverEnv } from "@/lib/env";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EquipmentStatus, RequestPriority, RequestStatus } from "@/lib/types";

// The enum values a list filter (`?status=`, `?priority=`) or a PATCH body
// may carry — the unions in src/lib/types.ts, spelled out once here so every
// handler validates against the same list. Checked BEFORE the query runs:
// `.eq("status", "bogus")` on a Postgres enum column is a PostgREST error,
// which used to surface as a 500 with the raw message where docs/API.md
// promises a 400.
export const REQUEST_STATUSES: readonly RequestStatus[] = [
  "new",
  "in_progress",
  "scheduled",
  "on_hold",
  "resolved",
  "canceled",
];
export const REQUEST_PRIORITIES: readonly RequestPriority[] = ["low", "normal", "high", "urgent"];
export const EQUIPMENT_STATUSES: readonly EquipmentStatus[] = [
  "active",
  "needs_service",
  "out_of_service",
  "retired",
];

/**
 * A 400 for a `?<name>=<value>` filter outside `allowed`, or null when the
 * filter is absent/empty (handlers skip it) or valid.
 */
export function invalidEnumFilter(
  name: string,
  value: string | null,
  allowed: readonly string[]
): NextResponse | null {
  if (!value || allowed.includes(value)) return null;
  return jsonError(`${name} must be one of: ${allowed.join(", ")}`, 400);
}

// ISO 8601 date or date-time — what docs/API.md documents for
// `updated_since` / `since` — with optional fractional seconds and offset.
// Anything Postgres might still coerce ("yesterday", "Sept 1") is rejected
// on purpose: the contract is ISO, and a non-ISO value that Postgres
// rejects would otherwise be a 500.
const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})?)?$/;

/**
 * A 400 for a `?<name>=<value>` timestamp filter that isn't an ISO 8601
 * date/date-time, or null when the filter is absent/empty or valid.
 */
export function invalidTimestampFilter(name: string, value: string | null): NextResponse | null {
  if (!value) return null;
  if (ISO_TIMESTAMP_RE.test(value) && Number.isFinite(Date.parse(value))) return null;
  return jsonError(`${name} must be an ISO 8601 timestamp, e.g. 2026-09-01T00:00:00Z`, 400);
}

// Every `?equipment_id=` / `?customer_id=` filter lands on a uuid column.
// Postgres rejects a non-uuid with 22P02, which PostgREST surfaced as a 500
// with the raw message — the same class as the enum/timestamp checks above.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A 400 for a `?<name>=<value>` id filter that isn't a UUID, or null when
 * the filter is absent/empty (handlers skip it) or valid.
 */
export function invalidUuidFilter(name: string, value: string | null): NextResponse | null {
  if (!value || UUID_RE.test(value)) return null;
  return jsonError(`${name} must be a UUID`, 400);
}

/**
 * Every column of `service_requests` that belongs in an API response, in
 * `src/lib/types.ts` order. Spelled out rather than `select("*")` so a column
 * added by a migration can never appear in the public API contract by
 * accident — `priority_rank` (0017) is exactly that: a generated sort key
 * that is an internal implementation detail, not something a client should
 * see or start depending on.
 */
export const SERVICE_REQUEST_COLUMNS = [
  "id",
  "equipment_id",
  "company_id",
  "description",
  "contact_name",
  "contact_email",
  "contact_phone",
  "status",
  "priority",
  "assigned_to",
  "assigned_at",
  "customer_id",
  "public_token",
  "status_updated_at",
  "scheduled_for",
  "closed_by",
  "resolution_summary",
  "resolution_recommendations",
  "resolved_at",
  "resolution_email_sent_at",
  "troubleshooting_path",
  "ai_summary",
  "updated_at",
  "created_at",
].join(", ");

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export function jsonData(data: unknown, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ data, ...extra }, { headers: { "Cache-Control": "no-store" } });
}

export function equipmentPhotoUrl(photoPath: string | null): string | null {
  return companyAssetUrl(serverEnv.NEXT_PUBLIC_SUPABASE_URL, photoPath);
}

export function statusUrlFor(publicToken: string): string {
  return getRequestStatusUrl(publicToken);
}

export function scanUrlFor(token: string): string {
  return getEquipmentPublicUrl(token);
}

/** A profile row scoped to a company, or null if it doesn't exist / belongs to another company. */
export async function findCompanyProfile(
  admin: SupabaseClient,
  companyId: string,
  profileId: string
): Promise<{ id: string; full_name: string | null } | null> {
  const { data } = await admin
    .from("profiles")
    .select("id, full_name")
    .eq("id", profileId)
    .eq("company_id", companyId)
    .maybeSingle<{ id: string; full_name: string | null }>();
  return data ?? null;
}
