import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardNav } from "@/components/dashboard-nav";
import { SignOutButton } from "@/components/sign-out-button";
import type { Company, Profile } from "@/lib/types";

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

    const { error } = await supabase.rpc("create_company_and_profile", {
      p_company_name: companyName,
      p_notification_email: notificationEmail,
      p_full_name: fullName ?? "",
    });

    if (error) {
      redirect("/onboarding");
    }

    const { data: createdProfile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle<Profile>();

    profile = createdProfile;
  }

  if (!profile) {
    redirect("/onboarding");
  }

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("id", profile.company_id)
    .maybeSingle<Company>();

  return (
    <div className="flex min-h-svh">
      <aside className="hidden w-60 shrink-0 border-r bg-muted/20 p-4 md:flex md:flex-col md:justify-between print:hidden">
        <div>
          <div className="mb-6 px-3">
            <p className="font-semibold leading-tight">{company?.name ?? "EquipQR"}</p>
            <p className="text-xs text-muted-foreground">{profile.full_name}</p>
          </div>
          <DashboardNav />
        </div>
        <SignOutButton />
      </aside>
      <div className="flex-1">
        <header className="flex items-center justify-between border-b p-4 md:hidden print:hidden">
          <p className="font-semibold">{company?.name ?? "EquipQR"}</p>
          <SignOutButton />
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
