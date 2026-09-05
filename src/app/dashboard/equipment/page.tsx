import Link from "next/link";
import { HardHat } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { NewEquipmentDialog } from "./new-equipment-dialog";
import type { Customer, Equipment, EquipmentType } from "@/lib/types";
import { getEntitlements, hasFeature } from "@/lib/billing";
import { FEATURES } from "@/lib/features";

export default async function EquipmentPage() {
  const supabase = await createClient();

  const [{ data: equipment }, { data: equipmentTypes }, { data: customers }, entitlements] =
    await Promise.all([
      supabase
        .from("equipment")
        .select("*")
        .order("created_at", { ascending: false })
        .returns<Equipment[]>(),
      supabase.from("equipment_types").select("*").returns<EquipmentType[]>(),
      supabase.from("customers").select("*").order("name").returns<Customer[]>(),
      getEntitlements(),
    ]);
  const batchQrEnabled = FEATURES.batchQr && hasFeature(entitlements, "batchQr");

  const typeById = new Map((equipmentTypes ?? []).map((t) => [t.id, t]));
  const customerById = new Map((customers ?? []).map((c) => [c.id, c]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Equipment</h1>
          <p className="text-muted-foreground">
            Physical units in the field, each with its own QR code.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            render={<Link href="/dashboard/equipment/labels" />}
            nativeButton={false}
            variant="outline"
          >
            Label sheets
          </Button>
          <NewEquipmentDialog
            equipmentTypes={equipmentTypes ?? []}
            customers={customers ?? []}
            batchQrEnabled={batchQrEnabled}
          />
        </div>
      </div>

      {!equipmentTypes || equipmentTypes.length === 0 ? (
        <EmptyState icon={HardHat} message="Create an equipment type first, then add equipment here." />
      ) : !equipment || equipment.length === 0 ? (
        <EmptyState
          icon={HardHat}
          message="No equipment yet. Add your first unit to generate its QR code."
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Serial #</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {equipment.map((item) => (
                <TableRow key={item.id} className="cursor-pointer">
                  <TableCell>
                    <Link href={`/dashboard/equipment/${item.id}`} className="font-medium hover:underline">
                      {item.name}
                    </Link>
                  </TableCell>
                  <TableCell>{typeById.get(item.equipment_type_id)?.name ?? "—"}</TableCell>
                  <TableCell>
                    {item.customer_id ? customerById.get(item.customer_id)?.name ?? "—" : "—"}
                  </TableCell>
                  <TableCell>{item.location ?? "—"}</TableCell>
                  <TableCell>{item.serial_number ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
