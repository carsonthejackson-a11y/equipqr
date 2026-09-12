import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { Logo } from "@/components/logo";
import { OwnerSetupFlow } from "./owner-setup-flow";

export default async function OwnerOnboardingPage() {
  const supabase = await createClient();
  const { profile } = await getCurrentProfile();

  const [{ count: locationCount }, { count: typeCount }] = await Promise.all([
    supabase
      .from("locations")
      .select("*", { count: "exact", head: true })
      .eq("company_id", profile.company_id),
    supabase
      .from("equipment_types")
      .select("*", { count: "exact", head: true })
      .eq("company_id", profile.company_id),
  ]);

  return (
    <div className="mx-auto max-w-lg space-y-8 py-6">
      <div className="space-y-2 text-center">
        <Logo className="justify-center" />
        <h1 className="text-2xl font-semibold">Let&apos;s get set up</h1>
        <p className="text-muted-foreground">Two quick steps, then you&apos;re ready to tag equipment.</p>
      </div>

      <OwnerSetupFlow hasLocation={(locationCount ?? 0) > 0} hasEquipmentTypes={(typeCount ?? 0) > 0} />
    </div>
  );
}
