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
