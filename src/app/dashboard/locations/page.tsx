import Link from "next/link";
import { MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
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

export default async function LocationsPage() {
  const supabase = await createClient();

  const [{ data: locations }, { data: equipment }] = await Promise.all([
    supabase.from("locations").select("*").order("name").returns<Location[]>(),
    supabase.from("equipment").select("id, location_id").returns<Pick<Equipment, "id" | "location_id">[]>(),
  ]);

  const unitCountByLocation = new Map<string, number>();
  for (const item of equipment ?? []) {
    if (!item.location_id) continue;
    unitCountByLocation.set(item.location_id, (unitCountByLocation.get(item.location_id) ?? 0) + 1);
  }

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
