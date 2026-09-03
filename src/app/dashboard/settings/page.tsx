import { requireOwner } from "@/lib/auth";
import { OwnerOnlyCard } from "@/components/owner-only-card";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const ctx = await requireOwner();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground">Company profile and notification preferences.</p>
      </div>
      {ctx ? (
        <SettingsForm company={ctx.company} />
      ) : (
        <OwnerOnlyCard message="Only company owners can change company settings." />
      )}
    </div>
  );
}
