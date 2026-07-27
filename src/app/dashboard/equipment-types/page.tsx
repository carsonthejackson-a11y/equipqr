import Link from "next/link";
import { Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { NewEquipmentTypeDialog } from "./new-type-dialog";
import type { EquipmentType } from "@/lib/types";

export default async function EquipmentTypesPage() {
  const supabase = await createClient();
  const { data: types } = await supabase
    .from("equipment_types")
    .select("*")
    .order("created_at", { ascending: false })
    .returns<EquipmentType[]>();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Equipment types</h1>
          <p className="text-muted-foreground">
            Reusable troubleshooting guide templates — one per model or category.
          </p>
        </div>
        <NewEquipmentTypeDialog />
      </div>

      {!types || types.length === 0 ? (
        <EmptyState
          icon={Wrench}
          message="No equipment types yet. Create one to start building a troubleshooting guide."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {types.map((type) => (
            <Link key={type.id} href={`/dashboard/equipment-types/${type.id}`}>
              <Card className="h-full transition-colors hover:bg-accent/50">
                <CardHeader>
                  <CardTitle>{type.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {type.description || "No description"}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
