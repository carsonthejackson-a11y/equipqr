"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Download, FileSpreadsheet, Printer } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EQUIPMENT_STATUS_LABELS } from "@/components/status-badge";
import { EQUIPMENT_IMPORT_COLUMNS, equipmentImportTemplateCsv } from "@/lib/csv";
import { isEquipmentStatus } from "@/lib/equipment";
import {
  previewEquipmentImport,
  runEquipmentImport,
  type ImportPreview,
  type ImportResult,
} from "./actions";

/** Only the first N rows are rendered — a 2,000-row table helps nobody. */
const PREVIEW_LIMIT = 50;

function downloadTemplate() {
  const blob = new Blob([equipmentImportTemplateCsv()], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "equipqr-equipment-template.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function statusLabel(value: string): string {
  return isEquipmentStatus(value) ? EQUIPMENT_STATUS_LABELS[value] : value || "—";
}

export function ImportForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [createMissing, setCreateMissing] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function buildPreview(text: string, withMissing: boolean) {
    setBusy(true);
    setError(null);
    const response = await previewEquipmentImport(text, withMissing);
    setBusy(false);

    if ("error" in response) {
      setPreview(null);
      setError(response.error);
      return;
    }
    setPreview(response);
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setResult(null);
    setFileName(file.name);
    const text = await file.text();
    setCsvText(text);
    await buildPreview(text, createMissing);
  }

  async function handleCreateMissingChange(checked: boolean) {
    setCreateMissing(checked);
    if (csvText) {
      await buildPreview(csvText, checked);
    }
  }

  async function handleImport() {
    if (!csvText) return;
    setBusy(true);
    setError(null);
    const response = await runEquipmentImport(csvText, createMissing);
    setBusy(false);

    if ("error" in response) {
      setError(response.error);
      return;
    }

    setResult(response);
    setPreview(null);
    setCsvText(null);
    setFileName(null);
    toast.success(`Imported ${response.created} units`);
    router.refresh();
  }

  if (result) {
    return (
      <Card className="space-y-4 p-6">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-5 text-emerald-600 dark:text-emerald-400" />
          <div className="space-y-1">
            <p className="font-medium">Imported {result.created} units.</p>
            <p className="text-sm text-muted-foreground">
              Each one got a QR code, ready to print.
              {result.newTypes > 0 && ` Created ${result.newTypes} new equipment type(s).`}
              {result.newCustomers > 0 && ` Created ${result.newCustomers} new customer(s).`}
              {result.skipped > 0 && ` Skipped ${result.skipped} row(s) with errors.`}
            </p>
            {result.codeErrors > 0 && (
              <p className="text-sm text-destructive">
                {result.codeErrors} unit(s) couldn&apos;t get a QR code automatically — assign one
                from the unit&apos;s page.
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button nativeButton={false} render={<Link href="/dashboard/equipment/labels" />}>
            <Printer className="size-4" />
            Now print labels
          </Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/dashboard/equipment" />}
          >
            Back to equipment
          </Button>
        </div>
      </Card>
    );
  }

  const previewRows = preview?.rows.slice(0, PREVIEW_LIMIT) ?? [];
  const canImport = !!preview && !preview.fatal && preview.validCount > 0;

  return (
    <div className="space-y-6">
      <Card className="space-y-4 p-6">
        <div>
          <h2 className="font-medium">1. Start from the template</h2>
          <p className="text-sm text-muted-foreground">
            Columns: {EQUIPMENT_IMPORT_COLUMNS.join(", ")}. Only <code>name</code> and{" "}
            <code>equipment_type</code> are required; dates are <code>YYYY-MM-DD</code>.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={downloadTemplate}>
          <Download className="size-4" />
          Download template CSV
        </Button>
      </Card>

      <Card className="space-y-4 p-6">
        <div>
          <h2 className="font-medium">2. Upload your file</h2>
          <p className="text-sm text-muted-foreground">
            Nothing is saved until you confirm the preview below.
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleFile}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}>
            <FileSpreadsheet className="size-4" />
            {fileName ? "Choose a different file" : "Choose CSV file"}
          </Button>
          {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
        </div>

        <div className="flex items-start gap-2">
          <Checkbox
            id="createMissing"
            checked={createMissing}
            onCheckedChange={handleCreateMissingChange}
            className="mt-0.5"
          />
          <Label htmlFor="createMissing" className="font-normal">
            <span className="block font-medium text-foreground">
              Create missing equipment types and customers
            </span>
            <span className="block text-sm text-muted-foreground">
              Off by default: an unrecognised name is usually a typo, not a new record.
            </span>
          </Label>
        </div>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Import failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {preview?.fatal && (
        <Alert variant="destructive">
          <AlertTitle>Can&apos;t import this file</AlertTitle>
          <AlertDescription>{preview.fatal}</AlertDescription>
        </Alert>
      )}

      {preview && preview.rows.length > 0 && (
        <Card className="space-y-4 p-6">
          <div>
            <h2 className="font-medium">3. Review</h2>
            <p className="text-sm text-muted-foreground">
              {preview.validCount} row{preview.validCount === 1 ? "" : "s"} ready
              {preview.errorCount > 0 && `, ${preview.errorCount} with problems (skipped)`}.
              {preview.newTypes.length > 0 &&
                ` New types: ${preview.newTypes.join(", ")}.`}
              {preview.newCustomers.length > 0 &&
                ` New customers: ${preview.newCustomers.join(", ")}.`}
            </p>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Row</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Make / model</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Problems</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows.map((row) => (
                  <TableRow key={row.line} className={row.errors.length > 0 ? "opacity-70" : ""}>
                    <TableCell className="text-muted-foreground">{row.line}</TableCell>
                    <TableCell className="font-medium">{row.name || "—"}</TableCell>
                    <TableCell>
                      {row.equipmentType || "—"}
                      {row.createsType && (
                        <span className="block text-xs text-muted-foreground">will be created</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.customer || "—"}
                      {row.createsCustomer && (
                        <span className="block text-xs text-muted-foreground">will be created</span>
                      )}
                    </TableCell>
                    <TableCell>{[row.make, row.model].filter(Boolean).join(" ") || "—"}</TableCell>
                    <TableCell>{statusLabel(row.status)}</TableCell>
                    <TableCell className="text-sm text-destructive">
                      {row.errors.join("; ")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {preview.rows.length > PREVIEW_LIMIT && (
            <p className="text-sm text-muted-foreground">
              Showing the first {PREVIEW_LIMIT} of {preview.rows.length} rows. All of them are
              validated — only the display is trimmed.
            </p>
          )}

          <Button type="button" onClick={handleImport} disabled={!canImport || busy}>
            {busy ? "Importing..." : `Import ${preview.validCount} units`}
          </Button>
        </Card>
      )}
    </div>
  );
}
