import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Company, Profile } from "@/lib/types";

export type CurrentProfile = { profile: Profile; company: Company };

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  if (!profile) {
    redirect("/onboarding");
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
