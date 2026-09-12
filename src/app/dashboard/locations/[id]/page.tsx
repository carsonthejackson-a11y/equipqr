import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { BackLink } from "@/components/back-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EquipmentStatusBadge } from "@/components/status-badge";
import { getCurrentProfile } from "@/lib/auth";
import type { Equipment, Location } from "@/lib/types";
import { EditLocationForm } from "./edit-location-form";
import { SitePinCard } from "./site-pin-card";

export default async function LocationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: location } = await supabase
    .from("locations")
    .select("*")
    .eq("id", id)
    .maybeSingle<Location>();

  if (!location) {
    notFound();
  }

  const [{ data: units }, { profile }] = await Promise.all([
    supabase
      .from("equipment")
      .select("id, name, status")
      .eq("location_id", id)
      .order("name")
      .returns<Pick<Equipment, "id" | "name" | "status">[]>(),
    getCurrentProfile(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <BackLink href="/dashboard/locations" label="Back to locations" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">{location.name}</h1>
          <Button variant="outline" nativeButton={false} render={<Link href={`/dashboard/locations/${id}/poster`} />}>
            <Printer className="size-4" />
            Print staff poster
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <EditLocationForm location={location} canDelete={profile.role === "owner"} />
            </CardContent>
          </Card>

          <SitePinCard locationId={location.id} sitePin={location.site_pin} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Equipment here</CardTitle>
          </CardHeader>
          <CardContent>
            {!units || units.length === 0 ? (
              <p className="text-sm text-muted-foreground">No equipment assigned to this location yet.</p>
            ) : (
              <ul className="divide-y">
                {units.map((unit) => (
                  <li key={unit.id}>
                    <Link
                      href={`/dashboard/equipment/${unit.id}`}
                      className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-foreground"
                    >
                      <span className="truncate font-medium">{unit.name}</span>
                      <EquipmentStatusBadge status={unit.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
