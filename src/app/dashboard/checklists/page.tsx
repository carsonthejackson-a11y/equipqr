import Link from "next/link";
import { ClipboardCheck, ClipboardList, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
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
import { formatRelativeTime } from "@/lib/format";
import type { ChecklistTemplate, EquipmentType } from "@/lib/types";

export default async function ChecklistsPage() {
  const supabase = await createClient();

  const [{ data: templates }, { data: equipmentTypes }] = await Promise.all([
    supabase
      .from("checklist_templates")
      .select("*")
      .order("updated_at", { ascending: false })
      .returns<ChecklistTemplate[]>(),
    supabase.from("equipment_types").select("*").returns<EquipmentType[]>(),
  ]);

  const typeNameById = new Map((equipmentTypes ?? []).map((t) => [t.id, t.name]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Checklists</h1>
          <p className="text-muted-foreground">
            Inspection templates technicians run from the equipment sticker in the field.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/dashboard/checklists/inspections" />}
          >
            <ClipboardList className="size-4" />
            Inspections
          </Button>
          <Button nativeButton={false} render={<Link href="/dashboard/checklists/new" />}>
            <Sparkles className="size-4" />
            New checklist
          </Button>
        </div>
      </div>

      {!templates || templates.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          message="No checklists yet. Create one, or generate a draft with AI, so technicians have something to run at the machine."
        />
      ) : (
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Applies to</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((template) => (
                <TableRow key={template.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/dashboard/checklists/${template.id}`}
                      className="hover:underline"
                    >
                      {template.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {template.equipment_type_id
                      ? typeNameById.get(template.equipment_type_id) ?? "Unknown type"
                      : "Any equipment"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{template.items.length}</TableCell>
                  <TableCell>
                    <Badge variant={template.active ? "default" : "outline"}>
                      {template.active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatRelativeTime(template.updated_at)}
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
