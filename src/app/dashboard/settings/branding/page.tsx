import { requireOwner } from "@/lib/auth";
import { getEntitlements, hasFeature } from "@/lib/billing";
import { serverEnv } from "@/lib/env";
import { OwnerOnlyCard } from "@/components/owner-only-card";
import { SettingsSubnav } from "../settings-subnav";
import { BrandingForm } from "./branding-form";

export default async function BrandingPage() {
  const ctx = await requireOwner();
  const entitlements = ctx ? await getEntitlements() : null;
  const entitled = hasFeature(entitlements, "branding");

  return (
    <div className="space-y-6">
      <SettingsSubnav />
      <div>
        <h1 className="text-2xl font-semibold">Branding</h1>
        <p className="text-muted-foreground">
          Your logo and brand color on the customer-facing QR scan and status pages.
        </p>
      </div>
      {ctx ? (
        <BrandingForm
          company={ctx.company}
          entitled={entitled}
          planId={entitlements?.plan_id ?? null}
          supabaseUrl={serverEnv.NEXT_PUBLIC_SUPABASE_URL}
        />
      ) : (
        <OwnerOnlyCard message="Only company owners can change branding." />
      )}
    </div>
  );
}
