"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DEFAULT_LABEL_TEMPLATE_ID,
  LABEL_TEMPLATE_LIST,
  LABEL_TEMPLATES,
  labelsPerSheet,
  sheetCount,
  type LabelTemplateId,
} from "@/lib/labels/templates";

/** One printable unit: an equipment row joined to its active code. */
export type LabelRow = {
  codeId: string;
  name: string;
  /** Already formatted as ABCD-2345. */
  shortCode: string;
  location: string | null;
  customerId: string | null;
  customerName: string | null;
  printedAt: string | null;
};

const ALL_CUSTOMERS = "__all__";
const NO_CUSTOMER = "__none__";

export function LabelSheetBuilder({
  rows,
  customers,
}: {
  rows: LabelRow[];
  customers: { id: string; name: string }[];
}) {
  const [templateId, setTemplateId] = useState<LabelTemplateId>(DEFAULT_LABEL_TEMPLATE_ID);
  const [customerFilter, setCustomerFilter] = useState(ALL_CUSTOMERS);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [downloading, setDownloading] = useState(false);

  const visibleRows = useMemo(() => {
    if (customerFilter === ALL_CUSTOMERS) return rows;
    if (customerFilter === NO_CUSTOMER) return rows.filter((row) => !row.customerId);
    return rows.filter((row) => row.customerId === customerFilter);
  }, [rows, customerFilter]);

  // "Select all" applies to what's on screen, so filtering to one customer and
  // ticking the box selects exactly that customer's units.
  const visibleIds = visibleRows.map((row) => row.codeId);
  const selectedVisible = visibleIds.filter((id) => selected.has(id));
  const allVisibleSelected = visibleIds.length > 0 && selectedVisible.length === visibleIds.length;

  function toggle(codeId: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(codeId);
      else next.delete(codeId);
      return next;
    });
  }

  function toggleAllVisible(checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  const template = LABEL_TEMPLATES[templateId];
  const selectedCount = selected.size;
  const sheets = sheetCount(template, selectedCount);

  async function handleDownload() {
    if (selectedCount === 0) return;
    setDownloading(true);
    try {
      // POST rather than a GET link: the selection can run to hundreds of ids,
      // well past what a URL should carry.
      const response = await fetch("/dashboard/equipment/labels/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, codeIds: [...selected] }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        toast.error(body?.error ?? "Couldn't build that label sheet. Try again.");
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `equipqr-labels-${templateId}.pdf`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      toast.success(`${selectedCount} label${selectedCount === 1 ? "" : "s"} ready to print`);
    } catch {
      toast.error("Couldn't build that label sheet. Try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="min-w-52 space-y-2">
            <Label htmlFor="templateId">Label sheet</Label>
            <Select
              value={templateId}
              onValueChange={(value) =>
                setTemplateId((value as LabelTemplateId) ?? DEFAULT_LABEL_TEMPLATE_ID)
              }
              items={Object.fromEntries(LABEL_TEMPLATE_LIST.map((t) => [t.id, t.name]))}
            >
              <SelectTrigger id="templateId" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LABEL_TEMPLATE_LIST.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{template.description}</p>
          </div>

          <div className="min-w-52 space-y-2">
            <Label htmlFor="customerFilter">Customer</Label>
            <Select
              value={customerFilter}
              onValueChange={(value) => setCustomerFilter(value ?? ALL_CUSTOMERS)}
              items={{
                [ALL_CUSTOMERS]: "All customers",
                [NO_CUSTOMER]: "No customer",
                ...Object.fromEntries(customers.map((c) => [c.id, c.name])),
              }}
            >
              <SelectTrigger id="customerFilter" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CUSTOMERS}>All customers</SelectItem>
                <SelectItem value={NO_CUSTOMER}>No customer</SelectItem>
                {customers.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="ml-auto flex items-end gap-3">
            <p className="pb-2 text-sm text-muted-foreground">
              {selectedCount === 0
                ? `Nothing selected — ${labelsPerSheet(template)} fit on a sheet`
                : `${selectedCount} selected — ${sheets} sheet${sheets === 1 ? "" : "s"}`}
            </p>
            <Button onClick={handleDownload} disabled={selectedCount === 0 || downloading}>
              {downloading ? "Building..." : "Download PDF"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allVisibleSelected}
                  indeterminate={selectedVisible.length > 0 && !allVisibleSelected}
                  onCheckedChange={toggleAllVisible}
                  aria-label="Select all equipment"
                  disabled={visibleIds.length === 0}
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Label printed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No equipment matches that filter.
                </TableCell>
              </TableRow>
            ) : (
              visibleRows.map((row) => (
                <TableRow key={row.codeId}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(row.codeId)}
                      onCheckedChange={(checked) => toggle(row.codeId, checked)}
                      aria-label={`Select ${row.name}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="font-mono">{row.shortCode}</TableCell>
                  <TableCell>{row.customerName ?? "—"}</TableCell>
                  <TableCell>{row.location ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.printedAt ? new Date(row.printedAt).toLocaleDateString() : "Never"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
