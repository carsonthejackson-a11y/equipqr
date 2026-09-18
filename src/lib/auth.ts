import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Company, CompanyKind, Profile } from "@/lib/types";

export type CurrentProfile = { profile: Profile; company: Company };

/** meta.pending_company_kind is user-supplied (auth metadata) — never trust it beyond these two literals. (Same as src/app/dashboard/layout.tsx.) */
function pendingCompanyKind(value: string | undefined): CompanyKind {
  return value === "equipment_owner" ? "equipment_owner" : "service_provider";
}

// For pages/actions that need "any logged-in staff member of a company",
// regardless of role. Redirects to /login or /onboarding when that's not
// the case — those states shouldn't normally be reachable from inside
// /dashboard (the layout already guards them), but callers outside it
// (e.g. a route handler) can rely on this too.
export async function getCurrentProfile(): Promise<CurrentProfile> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  let { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  if (!profile) {
    // Fresh sign-up race: Next.js renders a layout and its page IN PARALLEL,
    // so on the very first /dashboard request after email confirmation this
    // SELECT runs at the same moment src/app/dashboard/layout.tsx is
    // auto-creating the company from the sign-up metadata (via the
    // create_company_and_profile RPC). The profile row usually doesn't exist
    // yet from this side of the race, and a plain redirect("/onboarding")
    // here made every new owner retype company details the layout was
    // committing at that instant (retyped values then discarded — the RPC is
    // idempotent). So mirror the layout exactly: same invite short-circuit,
    // same RPC with the same arguments, same synthesised profile. Calling
    // the idempotent RPC from both places always agrees on the company id.
    // The welcome email stays the layout's job.
    const meta = user.user_metadata as Record<string, string | undefined>;
    const companyName = meta.pending_company_name;
    const notificationEmail = meta.pending_notification_email;
    const fullName = meta.pending_full_name;
    const pendingInviteToken = meta.pending_invite_token;

    if (pendingInviteToken) {
      redirect(`/invite/${pendingInviteToken}`);
    }

    if (!companyName || !notificationEmail) {
      redirect("/onboarding");
    }

    const { data: companyId, error } = await supabase.rpc("create_company_and_profile", {
      p_company_name: companyName,
      p_notification_email: notificationEmail,
      p_full_name: fullName ?? "",
      p_kind: pendingCompanyKind(meta.pending_company_kind),
    });

    if (error || !companyId) {
      redirect("/onboarding");
    }

    profile = {
      id: user.id,
      company_id: companyId,
      full_name: fullName ?? null,
      role: "owner",
      created_at: new Date().toISOString(),
    };
  }

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("id", profile.company_id)
    .maybeSingle<Company>();

  if (!company) {
    redirect("/onboarding");
  }

  return { profile, company };
}

// For pages/actions restricted to owners (team, billing, company settings).
// Unlike getCurrentProfile(), a non-owner is NOT redirected — it returns
// null so the caller can either render a friendly "owners only" card (pages)
// or return an { error } tuple (server actions) instead of a hard bounce.
export async function requireOwner(): Promise<CurrentProfile | null> {
  const result = await getCurrentProfile();
  if (result.profile.role !== "owner") {
    return null;
  }
  return result;
}

// For platform-admin pages and routes under /admin. The admin layout's own
// check is not enough on its own: Next.js renders a layout and its page in
// parallel, so a page that queries data (especially with the service-role
// client) must gate itself before the first query. Returns true only for a
// signed-in platform admin.
export async function isPlatformAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: isAdmin, error } = await supabase.rpc("is_platform_admin");
  if (error) {
    console.error("isPlatformAdmin: is_platform_admin RPC failed:", error.message);
    return false;
  }
  return isAdmin === true;
}
