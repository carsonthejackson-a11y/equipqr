import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { SettingsSubnav } from "../settings-subnav";
import { AccountForm } from "./account-form";
import { DangerZone } from "./danger-zone";
import { SignOutButton } from "@/components/sign-out-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AccountPage() {
  const supabase = await createClient();
  const { profile, company } = await getCurrentProfile();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="space-y-6">
      <SettingsSubnav />
      <div>
        <h1 className="text-2xl font-semibold">Account</h1>
        <p className="text-muted-foreground">Your profile, login, and account security.</p>
      </div>

      <AccountForm fullName={profile.full_name} email={user?.email ?? ""} />

      {/*
        Q-49: on mobile the header no longer carries a standalone Sign out
        button (it now holds Scan + this page's link instead) — Account is
        the only place every role can sign out from a phone, so this card
        is unconditional, unlike DangerZone below.
      */}
      <Card>
        <CardHeader>
          <CardTitle>Session</CardTitle>
        </CardHeader>
        <CardContent>
          <SignOutButton />
        </CardContent>
      </Card>

      {profile.role === "owner" && <DangerZone companyName={company.name} />}
    </div>
  );
}
