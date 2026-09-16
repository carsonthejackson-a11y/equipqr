import Link from "next/link";
import { MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { NewLocationDialog } from "./new-location-dialog";
import type { Equipment, Location } from "@/lib/types";
import { getCurrentProfile } from "@/lib/auth";
import { getEntitlements, planFor } from "@/lib/billing";
import { nextPlanUp, usageMetricsFor } from "@/lib/plan-usage";

export default async function LocationsPage() {
  const supabase = await createClient();
  const { profile, company } = await getCurrentProfile();

  const [{ data: locations }, { data: equipment }, entitlements] = await Promise.all([
    supabase.from("locations").select("*").order("name").returns<Location[]>(),
    supabase.from("equipment").select("id, location_id").returns<Pick<Equipment, "id" | "location_id">[]>(),
    getEntitlements(),
  ]);

  const unitCountByLocation = new Map<string, number>();
  for (const item of equipment ?? []) {
    if (!item.location_id) continue;
    unitCountByLocation.set(item.location_id, (unitCountByLocation.get(item.location_id) ?? 0) + 1);
  }

  // Limits visible before work (docs/QOL-CONTINUITY-BRIEF.md item 6) — a
  // no-op for service_provider companies, whose plans all have a null
  // (unlimited) locationLimit.
  const plan = entitlements ? planFor(entitlements) : null;
  const locationsUsage =
    entitlements && plan
      ? usageMetricsFor({
          kind: company.kind,
          equipmentCount: entitlements.equipment_count,
          memberCount: entitlements.member_count,
          locationCount: entitlements.location_count,
          plan,
        }).find((s) => s.key === "locations")
      : undefined;
  const upgradeTarget = plan ? nextPlanUp(company.kind, plan.id) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Locations</h1>
          <p className="text-muted-foreground">
            The sites where your equipment lives — each gets its own optional staff PIN.
          </p>
        </div>
        <NewLocationDialog />
      </div>

      {locationsUsage?.atLimit && (
        <Alert variant="destructive">
          <AlertTitle>
            You&apos;ve reached the {locationsUsage.limit}-location limit of the {plan?.name} plan
          </AlertTitle>
          <AlertDescription>
            {profile.role === "owner" ? (
              <>
                {upgradeTarget &&
                  `Upgrade to ${upgradeTarget.name} for up to ${upgradeTarget.locationLimit} locations. `}
                <Link href="/dashboard/settings/billing">
                  {upgradeTarget ? "View plans" : "Manage billing"}
                </Link>
              </>
            ) : (
              "Ask your account owner to upgrade the plan to add more locations."
            )}
          </AlertDescription>
        </Alert>
      )}

      {!locations || locations.length === 0 ? (
        <EmptyState
          icon={MapPin}
          message="No locations yet. Add your first one to start tagging equipment there."
        />
      ) : (
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Units</TableHead>
                <TableHead>Staff PIN</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {locations.map((location) => (
                <TableRow key={location.id}>
                  <TableCell>
                    <Link
                      href={`/dashboard/locations/${location.id}`}
                      className="font-medium hover:underline"
                    >
                      {location.name}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">
                    {location.address ?? "—"}
                  </TableCell>
                  <TableCell>{unitCountByLocation.get(location.id) ?? 0}</TableCell>
                  <TableCell>
                    {location.site_pin ? (
                      <Badge variant="secondary">Set</Badge>
                    ) : (
                      <span className="text-muted-foreground">Not set</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {location.active ? (
                      <Badge variant="secondary">Active</Badge>
                    ) : (
                      <Badge variant="outline">Inactive</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
