import { notFound } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { generateQrDataUrl, getEquipmentPublicUrl } from "@/lib/qr";
import { PrintButton } from "@/app/dashboard/equipment/[id]/label/print-button";
import type { Company, QrCode } from "@/lib/types";

export default async function PrintQrSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const { company: companyId } = await searchParams;

  if (!companyId) {
    notFound();
  }

  const supabase = await createClient();

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .maybeSingle<Company>();

  if (!company) {
    notFound();
  }

  const { data: codes } = await supabase
    .from("qr_codes")
    .select("*")
    .eq("company_id", companyId)
    .eq("source", "batch")
    .is("equipment_id", null)
    .order("created_at", { ascending: false })
    .returns<QrCode[]>();

  const sheetCodes = codes ?? [];

  const cells = await Promise.all(
    sheetCodes.map(async (code) => ({
      token: code.token,
      qrDataUrl: await generateQrDataUrl(getEquipmentPublicUrl(code.token)),
    }))
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-xl font-semibold">Print sheet — {company.name}</h1>
          <p className="text-muted-foreground">
            {cells.length} unclaimed code{cells.length === 1 ? "" : "s"}. Each sticker shows its QR
            code and a short code as a fallback if the QR can&apos;t be scanned.
          </p>
        </div>
        <PrintButton />
      </div>

      {cells.length === 0 ? (
        <p className="text-muted-foreground">No unclaimed codes for this company.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 print:grid-cols-3 print:gap-2">
          {cells.map((cell) => (
            <div
              key={cell.token}
              className="flex flex-col items-center gap-2 break-inside-avoid rounded-lg border p-4 text-center print:border-dashed"
            >
              <Image src={cell.qrDataUrl} alt={cell.token} width={160} height={160} unoptimized />
              <p className="font-mono text-sm font-medium">{cell.token}</p>
              <p className="text-xs text-muted-foreground">{company.name}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
