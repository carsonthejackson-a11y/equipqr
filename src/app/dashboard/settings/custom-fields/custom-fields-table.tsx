"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Eye, ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CUSTOM_FIELD_TYPE_LABELS } from "@/lib/custom-fields";
import type { EquipmentCustomField } from "@/lib/types";
import { deleteCustomField, moveCustomField } from "./actions";
import { CustomFieldDialog } from "./custom-field-dialog";

export function CustomFieldsTable({
  fields,
  maxFields,
  readOnly = false,
}: {
  fields: EquipmentCustomField[];
  maxFields: number;
  /** Technicians can see what is defined (it shapes every equipment form) but not change it. */
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EquipmentCustomField | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EquipmentCustomField | null>(null);

  const atLimit = fields.length >= maxFields;

  function handleMove(field: EquipmentCustomField, direction: "up" | "down") {
    setPendingId(field.id);
    startTransition(async () => {
      const result = await moveCustomField(field.id, direction);
      setPendingId(null);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setPendingId(target.id);
    startTransition(async () => {
      const result = await deleteCustomField(target.id);
      setPendingId(null);
      setDeleteTarget(null);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Deleted "${target.label}"`);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Fields</CardTitle>
          <CardDescription>
            {fields.length} / {maxFields} defined. Shown on the equipment form in this order.
          </CardDescription>
        </div>
        {!readOnly && (
          <Button size="sm" disabled={atLimit} onClick={() => setCreateOpen(true)}>
            <Plus />
            Add field
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {fields.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            message={
              readOnly
                ? "No custom fields defined yet."
                : "No custom fields yet. Add one and it appears on every unit's Details tab."
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  {!readOnly && <TableHead className="w-20">Order</TableHead>}
                  <TableHead>Label</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Options</TableHead>
                  <TableHead>Scan page</TableHead>
                  {!readOnly && <TableHead className="w-24" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {fields.map((field, index) => {
                  const rowBusy = isPending && pendingId === field.id;
                  return (
                    <TableRow key={field.id}>
                      {!readOnly && (
                        <TableCell>
                          <div className="flex items-center gap-0.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            disabled={rowBusy || index === 0}
                            title="Move up"
                            onClick={() => handleMove(field, "up")}
                          >
                            <ArrowUp />
                            <span className="sr-only">Move {field.label} up</span>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            disabled={rowBusy || index === fields.length - 1}
                            title="Move down"
                            onClick={() => handleMove(field, "down")}
                          >
                            <ArrowDown />
                            <span className="sr-only">Move {field.label} down</span>
                          </Button>
                          </div>
                        </TableCell>
                      )}
                      <TableCell className="font-medium">
                        {field.label}
                        {field.help_text && (
                          <div className="max-w-xs truncate text-xs font-normal text-muted-foreground">
                            {field.help_text}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{field.key}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{CUSTOM_FIELD_TYPE_LABELS[field.field_type]}</Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-muted-foreground">
                        {field.field_type === "select" ? field.options.join(", ") : "—"}
                      </TableCell>
                      <TableCell>
                        {field.show_on_scan_page ? (
                          <span className="inline-flex items-center gap-1 text-xs">
                            <Eye className="size-3.5 text-muted-foreground" />
                            Shown
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Hidden</span>
                        )}
                      </TableCell>
                      {!readOnly && (
                        <TableCell>
                          <div className="flex justify-end gap-0.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            disabled={rowBusy}
                            title="Edit"
                            onClick={() => setEditTarget(field)}
                          >
                            <Pencil />
                            <span className="sr-only">Edit {field.label}</span>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            disabled={rowBusy}
                            title="Delete"
                            onClick={() => setDeleteTarget(field)}
                          >
                            <Trash2 className="text-destructive" />
                            <span className="sr-only">Delete {field.label}</span>
                          </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <CustomFieldDialog open={createOpen} onOpenChange={setCreateOpen} field={null} />
      <CustomFieldDialog
        open={!!editTarget}
        onOpenChange={(open) => !open && setEditTarget(null)}
        field={editTarget}
      />

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{deleteTarget?.label}&rdquo;?</DialogTitle>
            <DialogDescription>
              The field disappears from every equipment form, and any values already entered for it
              are removed from those units. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={isPending}>
              {isPending ? "Deleting..." : "Delete field"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
