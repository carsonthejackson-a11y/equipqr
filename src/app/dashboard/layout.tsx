import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { DashboardNav } from "@/components/dashboard-nav";
import { DashboardTopNav } from "@/components/dashboard-topnav";
import { SignOutButton } from "@/components/sign-out-button";
import { LogoMark } from "@/components/logo";
import { LockedScreen } from "@/components/billing/locked-screen";
import { TrialBanner } from "@/components/billing/trial-banner";
import { getEntitlements } from "@/lib/billing";
import type { Company, Profile } from "@/lib/types";

const BILLING_PATH = "/dashboard/settings/billing";

function daysUntil(iso: string) {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
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
    const meta = user.user_metadata as Record<string, string | undefined>;
    const companyName = meta.pending_company_name;
    const notificationEmail = meta.pending_notification_email;
    const fullName = meta.pending_full_name;

    if (!companyName || !notificationEmail) {
      redirect("/onboarding");
    }

    const { data: companyId, error } = await supabase.rpc("create_company_and_profile", {
      p_company_name: companyName,
      p_notification_email: notificationEmail,
      p_full_name: fullName ?? "",
    });

    if (error || !companyId) {
      redirect("/onboarding");
    }

    // Built directly from the RPC result instead of a follow-up SELECT: the
    // dashboard can briefly get two near-simultaneous requests right after
    // email confirmation (router prefetch racing the real navigation), and a
    // second SELECT for a row the other request just committed is prone to
    // missing it. The RPC itself is idempotent, so this is always accurate.
    profile = {
      id: user.id,
      company_id: companyId,
      full_name: fullName ?? null,
      role: "owner",
      created_at: new Date().toISOString(),
    };
  }

  if (!profile) {
    redirect("/onboarding");
  }

  const [{ data: company }, { data: isAdmin }, entitlements, headerList] = await Promise.all([
    supabase.from("companies").select("*").eq("id", profile.company_id).maybeSingle<Company>(),
    supabase.rpc("is_platform_admin"),
    getEntitlements(),
    headers(),
  ]);

  const pathname = headerList.get("x-pathname") ?? "";
  const onBillingPage = pathname === BILLING_PATH || pathname.startsWith(`${BILLING_PATH}/`);
  const isLocked = !!entitlements?.is_locked && !onBillingPage;
  const trialDaysLeft =
    entitlements?.is_trialing && entitlements.trial_ends_at
      ? daysUntil(entitlements.trial_ends_at)
      : null;

  return (
    <div className="flex min-h-svh">
      <aside className="hidden w-60 shrink-0 border-r bg-muted/20 p-4 md:flex md:flex-col md:justify-between print:hidden">
        <div>
          <div className="mb-6 flex items-center gap-2 px-3">
            <LogoMark className="size-7" />
            <div className="min-w-0">
              <p className="truncate font-semibold leading-tight">{company?.name ?? "EquipQR"}</p>
              <p className="truncate text-xs text-muted-foreground">{profile.full_name}</p>
            </div>
          </div>
          <DashboardNav isAdmin={!!isAdmin} />
        </div>
        <SignOutButton />
      </aside>
      <div className="flex-1">
        <header className="flex items-center justify-between border-b p-4 md:hidden print:hidden">
          <div className="flex items-center gap-2">
            <LogoMark className="size-7" />
            <p className="font-semibold">{company?.name ?? "EquipQR"}</p>
          </div>
          <SignOutButton />
        </header>
        <DashboardTopNav isAdmin={!!isAdmin} />
        {trialDaysLeft !== null && !onBillingPage && <TrialBanner daysLeft={trialDaysLeft} />}
        <main className="p-6">
          {isLocked ? <LockedScreen isOwner={profile.role === "owner"} /> : children}
        </main>
      </div>
    </div>
  );
}
