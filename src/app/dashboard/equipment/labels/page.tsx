import { QrCode } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatShortCode } from "@/lib/qr";
import { BackLink } from "@/components/back-link";
import { EmptyState } from "@/components/empty-state";
import type { Customer, Equipment, QrCode as QrCodeRow } from "@/lib/types";
import { LabelSheetBuilder, type LabelRow } from "./label-sheet-builder";
import { FindCodeForm } from "./find-code-form";

export const metadata = { title: "Label sheets" };

export default async function LabelSheetsPage({
  searchParams,
}: {
  searchParams: Promise<{ notfound?: string }>;
}) {
  const { notfound } = await searchParams;
  const supabase = await createClient();

  const [{ data: equipment }, { data: codes }, { data: customers }] = await Promise.all([
    supabase.from("equipment").select("*").order("name").returns<Equipment[]>(),
    supabase.from("qr_codes").select("*").eq("status", "active").returns<QrCodeRow[]>(),
    supabase.from("customers").select("*").order("name").returns<Customer[]>(),
  ]);

  const codeByEquipmentId = new Map(
    (codes ?? []).filter((code) => code.equipment_id).map((code) => [code.equipment_id!, code])
  );
  const customerById = new Map((customers ?? []).map((c) => [c.id, c.name]));

  // Only units with an active code can go on a sheet — there's nothing to
  // print for a unit whose code was retired and never replaced.
  const rows: LabelRow[] = (equipment ?? []).flatMap((unit) => {
    const code = codeByEquipmentId.get(unit.id);
    if (!code) return [];
    return [
      {
        codeId: code.id,
        name: unit.name,
        shortCode: formatShortCode(code.short_code),
        location: unit.location,
        customerId: unit.customer_id,
        customerName: unit.customer_id ? (customerById.get(unit.customer_id) ?? null) : null,
        printedAt: code.label_printed_at,
      },
    ];
  });

  const customerOptions = (customers ?? [])
    .filter((customer) => rows.some((row) => row.customerId === customer.id))
    .map((customer) => ({ id: customer.id, name: customer.name }));

  return (
    <div className="space-y-6">
      <div>
        <BackLink href="/dashboard/equipment" label="Back to equipment" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Label sheets</h1>
            <p className="text-muted-foreground">
              Print a page of QR stickers on standard Avery label sheets.
            </p>
          </div>
          <FindCodeForm notFound={notfound === "1"} />
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={QrCode}
          message="No equipment has an active QR code yet. Add a unit — or assign it a code — and it'll show up here."
        />
      ) : (
        <LabelSheetBuilder rows={rows} customers={customerOptions} />
      )}
    </div>
  );
}
