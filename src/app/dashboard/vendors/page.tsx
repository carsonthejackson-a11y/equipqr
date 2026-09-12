import Link from "next/link";
import { Truck } from "lucide-react";
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
import { NewVendorDialog } from "./new-vendor-dialog";
import type { Equipment, Vendor } from "@/lib/types";

export default async function VendorsPage() {
  const supabase = await createClient();

  const [{ data: vendors }, { data: equipment }] = await Promise.all([
    supabase.from("vendors").select("*").order("name").returns<Vendor[]>(),
    supabase.from("equipment").select("id, vendor_id").returns<Pick<Equipment, "id" | "vendor_id">[]>(),
  ]);

  const unitCountByVendor = new Map<string, number>();
  for (const item of equipment ?? []) {
    if (!item.vendor_id) continue;
    unitCountByVendor.set(item.vendor_id, (unitCountByVendor.get(item.vendor_id) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Vendors</h1>
          <p className="text-muted-foreground">
            The companies who service your equipment — pick one per unit, or set a default for a
            whole category.
          </p>
        </div>
        <NewVendorDialog />
      </div>

      {!vendors || vendors.length === 0 ? (
        <EmptyState
          icon={Truck}
          message="Add the companies who service your equipment. You'll pick one per unit — or set a default for a whole category, like refrigeration."
        />
      ) : (
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Categories</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Response time</TableHead>
                <TableHead>Units served</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendors.map((vendor) => (
                <TableRow key={vendor.id}>
                  <TableCell>
                    <Link href={`/dashboard/vendors/${vendor.id}`} className="font-medium hover:underline">
                      {vendor.name}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-48 truncate text-muted-foreground">
                    {vendor.categories.length > 0 ? vendor.categories.join(", ") : "—"}
                  </TableCell>
                  <TableCell>{vendor.phone ?? "—"}</TableCell>
                  <TableCell className="max-w-48 truncate">
                    {vendor.email ?? <span className="text-muted-foreground">No email on file</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {vendor.ack_sla_minutes < 60
                      ? `${vendor.ack_sla_minutes}m`
                      : `${Math.round(vendor.ack_sla_minutes / 60)}h`}
                  </TableCell>
                  <TableCell>{unitCountByVendor.get(vendor.id) ?? 0}</TableCell>
                  <TableCell>
                    {vendor.active ? (
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
