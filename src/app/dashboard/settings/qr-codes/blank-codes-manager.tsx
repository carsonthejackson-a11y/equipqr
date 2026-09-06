"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/ui/input";
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
import { generateBlankCodes } from "./actions";

export type BlankCodeRow = {
  id: string;
  /** Already formatted as ABCD-2345. */
  shortCode: string;
  createdAt: string;
};

export function BlankCodesManager({ rows }: { rows: BlankCodeRow[] }) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [templateId, setTemplateId] = useState<LabelTemplateId>(DEFAULT_LABEL_TEMPLATE_ID);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [downloading, setDownloading] = useState(false);

  const ids = rows.map((row) => row.id);
  const selectedIds = ids.filter((id) => selected.has(id));
  const allSelected = ids.length > 0 && selectedIds.length === ids.length;
  const template = LABEL_TEMPLATES[templateId];
  const sheets = sheetCount(template, selectedIds.length);

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(ids) : new Set());
  }

  async function handleGenerate(formData: FormData) {
    setGenerating(true);
    const result = await generateBlankCodes(formData);
    setGenerating(false);

    if (result?.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Batch generated");
    router.refresh();
  }

  async function handlePrint() {
    if (selectedIds.length === 0) return;
    setDownloading(true);
    try {
      const response = await fetch("/dashboard/settings/qr-codes/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId, codeIds: selectedIds }),
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
      link.download = `equipqr-blank-labels-${templateId}.pdf`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      toast.success(`${selectedIds.length} label${selectedIds.length === 1 ? "" : "s"} ready to print`);
      router.refresh();
    } catch {
      toast.error("Couldn't build that label sheet. Try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Generate blank codes</CardTitle>
          <CardDescription>
            Each one is a working QR code with nothing linked to it yet — scan it later (or use
            the &quot;Add new equipment from this sticker&quot; button on the scan page) to tag it
            to a unit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={handleGenerate} className="flex items-end gap-2">
            <div className="space-y-2">
              <Label htmlFor="count">Count</Label>
              <Input
                id="count"
                name="count"
                type="number"
                min={1}
                max={100}
                defaultValue={25}
                className="w-28"
              />
            </div>
            <Button type="submit" disabled={generating}>
              {generating ? "Generating..." : "Generate blank codes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <EmptyState
          icon={QrCode}
          message="No blank codes yet. Generate a batch above, then print them as labels below."
        />
      ) : (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-4">
            <div>
              <CardTitle>Unclaimed codes</CardTitle>
              <CardDescription>{rows.length} waiting to be tagged to equipment.</CardDescription>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-44 space-y-2">
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
              </div>
              <p className="pb-2 text-sm text-muted-foreground">
                {selectedIds.length === 0
                  ? `Nothing selected — ${labelsPerSheet(template)} fit on a sheet`
                  : `${selectedIds.length} selected — ${sheets} sheet${sheets === 1 ? "" : "s"}`}
              </p>
              <Button onClick={handlePrint} disabled={selectedIds.length === 0 || downloading}>
                {downloading ? "Building..." : "Print selected as labels"}
              </Button>
            </div>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    indeterminate={selectedIds.length > 0 && !allSelected}
                    onCheckedChange={toggleAll}
                    aria-label="Select all blank codes"
                  />
                </TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(row.id)}
                      onCheckedChange={(checked) => toggle(row.id, checked)}
                      aria-label={`Select ${row.shortCode}`}
                    />
                  </TableCell>
                  <TableCell className="font-mono">{row.shortCode}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(row.createdAt).toLocaleDateString()}
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
