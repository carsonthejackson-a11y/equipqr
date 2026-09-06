import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { BackLink } from "@/components/back-link";
import { Badge } from "@/components/ui/badge";
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
import { formatRelativeTime } from "@/lib/format";
import type { Equipment, Inspection, Profile } from "@/lib/types";

const INSPECTION_LIMIT = 100;

export default async function InspectionsListPage() {
  const supabase = await createClient();

  const { data: inspections } = await supabase
    .from("inspections")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(INSPECTION_LIMIT)
    .returns<Inspection[]>();

  const equipmentIds = [...new Set((inspections ?? []).map((i) => i.equipment_id))];
  const performerIds = [
    ...new Set((inspections ?? []).map((i) => i.performed_by).filter((id): id is string => !!id)),
  ];

  const [{ data: equipment }, { data: performers }] = await Promise.all([
    equipmentIds.length > 0
      ? supabase.from("equipment").select("id, name").in("id", equipmentIds).returns<Pick<Equipment, "id" | "name">[]>()
      : Promise.resolve({ data: [] as Pick<Equipment, "id" | "name">[] }),
    performerIds.length > 0
      ? supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", performerIds)
          .returns<Pick<Profile, "id" | "full_name">[]>()
      : Promise.resolve({ data: [] as Pick<Profile, "id" | "full_name">[] }),
  ]);

  const equipmentNameById = new Map((equipment ?? []).map((e) => [e.id, e.name]));
  const techNameById = new Map((performers ?? []).map((p) => [p.id, p.full_name]));

  return (
    <div className="space-y-6">
      <div>
        <BackLink href="/dashboard/checklists" label="Back to checklists" />
        <h1 className="text-2xl font-semibold">Inspections</h1>
        <p className="text-muted-foreground">Every checklist run in the field, most recent first.</p>
      </div>

      {!inspections || inspections.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          message="No inspections yet. They show up here once a technician runs a checklist from an equipment sticker."
        />
      ) : (
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Equipment</TableHead>
                <TableHead>Checklist</TableHead>
                <TableHead>Technician</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Failed items</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inspections.map((inspection) => (
                <TableRow key={inspection.id}>
                  <TableCell className="font-medium">
                    <Link href={`/dashboard/inspections/${inspection.id}`} className="hover:underline">
                      {equipmentNameById.get(inspection.equipment_id) ?? "Unknown equipment"}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{inspection.template_name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {inspection.performed_by ? techNameById.get(inspection.performed_by) ?? "Staff" : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {inspection.completed_at ? (
                      formatRelativeTime(inspection.completed_at)
                    ) : (
                      <Badge variant="outline">In progress</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {inspection.status === "completed" ? (
                      <Badge variant={inspection.failed_count > 0 ? "destructive" : "outline"}>
                        {inspection.failed_count}
                      </Badge>
                    ) : (
                      "—"
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
