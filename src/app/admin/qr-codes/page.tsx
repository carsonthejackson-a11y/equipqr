import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { CompanyPicker } from "./company-picker";
import { GenerateBatchForm } from "./generate-batch-form";
import type { Company, QrCode } from "@/lib/types";

export default async function AdminQrCodesPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const { company: companyId } = await searchParams;
  const supabase = await createClient();

  const { data: companies } = await supabase
    .from("companies")
    .select("*")
    .order("name")
    .returns<Company[]>();

  const selectedCompany = (companies ?? []).find((c) => c.id === companyId);

  const { data: codes } = companyId
    ? await supabase
        .from("qr_codes")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .returns<QrCode[]>()
    : { data: null };

  const batchCodes = (codes ?? []).filter((c) => c.source === "batch");
  const unclaimedCount = batchCodes.filter((c) => !c.equipment_id).length;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">QR code batches</h1>
        <p className="text-muted-foreground">
          Generate pre-printed codes for a company to send to your print vendor.
        </p>
      </div>

      <CompanyPicker companies={companies ?? []} selectedId={companyId} />

      {selectedCompany && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{selectedCompany.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <span>{batchCodes.length} pre-printed codes total</span>
                <span>{unclaimedCount} unclaimed</span>
                {batchCodes.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    nativeButton={false}
                    render={<Link href={`/admin/qr-codes/export?company=${selectedCompany.id}`} />}
                  >
                    Export CSV
                  </Button>
                )}
                {unclaimedCount > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    nativeButton={false}
                    render={
                      <Link href={`/admin/qr-codes/print?company=${selectedCompany.id}`} target="_blank" />
                    }
                  >
                    Print sheet
                  </Button>
                )}
              </div>
              <GenerateBatchForm companyId={selectedCompany.id} />
            </CardContent>
          </Card>

          {batchCodes.length > 0 && (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batchCodes.map((code) => (
                    <TableRow key={code.id}>
                      <TableCell className="font-mono">{code.token}</TableCell>
                      <TableCell>
                        {code.equipment_id ? (
                          <Badge variant="outline">Claimed</Badge>
                        ) : (
                          <Badge>Unclaimed</Badge>
                        )}
                      </TableCell>
                      <TableCell>{new Date(code.created_at).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
