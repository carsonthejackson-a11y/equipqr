import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { RATE_LIMITS, checkRateLimit } from "@/lib/rate-limit";

// API-key authentication for /api/v1/* (Business plan "data export & API").
//
// Keys look like `eqr_live_<40 base62 chars>`. Only the sha256 hash is
// stored; the plaintext is shown once at creation. Requests arrive with
// `Authorization: Bearer eqr_live_...`. Because there is no Supabase auth
// session behind an API request, RLS can't scope it — handlers use the
// service-role client and MUST filter every query by `ctx.companyId`
// explicitly. `ApiContext` exists to make that impossible to forget.

export const API_KEY_PREFIX = "eqr_live_";

export type ApiScope = "read" | "write";

export type ApiContext = {
  companyId: string;
  scopes: ApiScope[];
  /** Service-role client. Every query MUST be filtered by companyId. */
  admin: ReturnType<typeof createAdminClient>;
};

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/** Generates a new plaintext key plus the prefix/hash to store. */
export function generateApiKey(): { plaintext: string; keyPrefix: string; keyHash: string } {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(40);
  const body = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  const plaintext = `${API_KEY_PREFIX}${body}`;
  return { plaintext, keyPrefix: plaintext.slice(0, 12), keyHash: hashApiKey(plaintext) };
}

export type ApiAuthResult = { ok: true; ctx: ApiContext } | { ok: false; response: NextResponse };

/**
 * Authenticates a /api/v1 request. Returns a ready-made error response on
 * failure so handlers can `if (!auth.ok) return auth.response;`.
 */
export async function authenticateApiRequest(
  request: Request,
  requiredScope: ApiScope = "read"
): Promise<ApiAuthResult> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const plaintext = match?.[1]?.trim();

  if (!plaintext || !plaintext.startsWith(API_KEY_PREFIX)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Missing or malformed API key. Send `Authorization: Bearer eqr_live_...`." },
        { status: 401 }
      ),
    };
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "API access is not configured on this server." }, { status: 503 }),
    };
  }

  const keyHash = hashApiKey(plaintext);
  const { data, error } = await admin.rpc("resolve_api_key", { p_key_hash: keyHash });

  const row = Array.isArray(data) ? (data[0] as { company_id: string; scopes: string[] } | undefined) : undefined;
  if (error || !row) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid or revoked API key." }, { status: 401 }),
    };
  }

  const scopes = (row.scopes ?? []).filter((s): s is ApiScope => s === "read" || s === "write");
  if (!scopes.includes(requiredScope)) {
    return {
      ok: false,
      response: NextResponse.json({ error: `This key lacks the "${requiredScope}" scope.` }, { status: 403 }),
    };
  }

  const withinLimit = await checkRateLimit(`api:${keyHash.slice(0, 16)}`, RATE_LIMITS.apiKey);
  if (!withinLimit) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Rate limit exceeded." },
        { status: 429, headers: { "Retry-After": String(RATE_LIMITS.apiKey.windowSeconds) } }
      ),
    };
  }

  return { ok: true, ctx: { companyId: row.company_id, scopes, admin } };
}
