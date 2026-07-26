import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NewEquipmentDialog } from "./new-equipment-dialog";
import type { Equipment, EquipmentType } from "@/lib/types";

export default async function EquipmentPage() {
  const supabase = await createClient();

  const [{ data: equipment }, { data: equipmentTypes }] = await Promise.all([
    supabase
      .from("equipment")
      .select("*")
      .order("created_at", { ascending: false })
      .returns<Equipment[]>(),
    supabase.from("equipment_types").select("*").returns<EquipmentType[]>(),
  ]);

  const typeById = new Map((equipmentTypes ?? []).map((t) => [t.id, t]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Equipment</h1>
          <p className="text-muted-foreground">
            Physical units in the field, each with its own QR code.
          </p>
        </div>
        <NewEquipmentDialog equipmentTypes={equipmentTypes ?? []} />
      </div>

      {!equipmentTypes || equipmentTypes.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Create an equipment type first, then add equipment here.
          </CardContent>
        </Card>
      ) : !equipment || equipment.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No equipment yet. Add your first unit to generate its QR code.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
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
