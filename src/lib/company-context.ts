import "server-only";
import { cache } from "react";
import { getCurrentProfile } from "@/lib/auth";
import { getEntitlements, planFor, type Entitlements } from "@/lib/billing";
import { vocabFor, type Vocab } from "@/lib/vocab";
import { companyFormatters, type CompanyFormatters } from "@/lib/company-formatters";
import type { Company, CompanyKind, Profile, UserRole } from "@/lib/types";
import type { Plan } from "@/lib/plans";

// A small per-request bundle of the kind/vocab/timezone/plan/lock state that
// pages, server actions and route handlers currently re-derive by hand from
// getCurrentProfile() + company.kind + getEntitlements() + planFor(...) —
// this is that derivation, done once and shared. It intentionally does NOT
// grow into a capabilities/policy layer (no `can(...)`, no brand resolution)
// — it's a read of what getCurrentProfile()/getEntitlements() already
// return, nothing more. Build one with getCompanyContext().

export type { CompanyFormatters } from "@/lib/company-formatters";

export type CompanyContext = {
  profile: Profile;
  company: Company;
  /** Same as `profile.role` — surfaced at the top level since it's read far more often than the rest of `profile`. */
  role: UserRole;
  /** Same as `company.kind`. */
  kind: CompanyKind;
  /** `role === "owner"`. Named to stay distinct from `kind === "equipment_owner"` — "owner" is overloaded in this codebase (a team role vs. a company kind) and this field is only ever about the role. */
  isOwnerRole: boolean;
  /** `vocabFor(company.kind)` — the only source of "service request" vs. "work order" / "customer" vs. "vendor" copy; don't hand-write those nouns. */
  vocab: Vocab;
  /** Company-zoned date/time formatters, already bound to `company.timezone`. */
  fmt: CompanyFormatters;
  /** null when entitlements couldn't be resolved (see getEntitlements) — treat as "unknown", never as locked; every existing billing.ts guard already fails open the same way. */
  entitlements: Entitlements | null;
  /** `planFor(entitlements)`, or null when `entitlements` is null. */
  plan: Plan | null;
  /**
   * Whether the company is currently locked out of paid actions. This is
   * NOT a plain passthrough of `entitlements.is_locked` — it also applies
   * the same equipment_owner exception billing.ts's requireActiveSubscription()
   * does (owner-kind companies always have a free tier to fall back to and
   * are never locked), so any new code can branch on `ctx.isLocked` directly
   * without re-deriving that rule. `false` (not locked) when entitlements
   * is null, matching every other fail-open billing check in this codebase.
   */
  isLocked: boolean;
};

/**
 * Per-request company context — the profile/company/role/kind/vocab/
 * formatters/plan/lock state most dashboard pages, server actions and route
 * handlers need, resolved once instead of separately deriving
 * `company.kind === "equipment_owner"`, `vocabFor(...)`, `new Date(...).toLocaleString()`
 * and `getEntitlements()` at every call site.
 *
 * Wrapped in React's `cache()`: calling this more than once during the same
 * server render (e.g. a layout and a page both need it) reuses the first
 * call's result for the rest of that render instead of re-querying Supabase
 * — call it as often as convenient, it costs nothing beyond the first call.
 * (This app doesn't use Next's Cache Components / `"use cache"` — `cache()`
 * here is plain React request-render memoization, not a persistent cache.)
 *
 * **Signed out / no profile / no company yet:** this is built directly on
 * top of getCurrentProfile(), so it mirrors that function's behaviour
 * exactly — it **redirects** (to `/login` or `/onboarding`) rather than
 * returning a nullable value or throwing. Only call this from somewhere a
 * redirect is safe to happen (a page, layout, or a server action reachable
 * from inside `/dashboard`). For a public route, a cron job, or anything
 * else that must handle "not signed in" itself, call getCurrentProfile()
 * and/or getEntitlements() directly instead.
 */
export const getCompanyContext = cache(async (): Promise<CompanyContext> => {
  const { profile, company } = await getCurrentProfile();
  const entitlements = await getEntitlements();

  // Mirrors billing.ts's requireActiveSubscription(): equipment_owner
  // companies always have a free tier to fall back to and are never locked,
  // regardless of what the entitlements RPC's own is_locked flag says.
  const isLocked = entitlements ? entitlements.company_kind !== "equipment_owner" && entitlements.is_locked : false;

  return {
    profile,
    company,
    role: profile.role,
    kind: company.kind,
    isOwnerRole: profile.role === "owner",
    vocab: vocabFor(company.kind),
    fmt: companyFormatters(company.timezone),
    entitlements,
    plan: entitlements ? planFor(entitlements) : null,
    isLocked,
  };
});
