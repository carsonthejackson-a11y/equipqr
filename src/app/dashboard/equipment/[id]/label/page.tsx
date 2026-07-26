import { notFound } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { generateQrDataUrl, getEquipmentPublicUrl } from "@/lib/qr";
import type { Equipment, Company } from "@/lib/types";
import { PrintButton } from "./print-button";

export default async function EquipmentLabelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: equipment } = await supabase
    .from("equipment")
    .select("*")
    .eq("id", id)
    .maybeSingle<Equipment>();

  if (!equipment) {
    notFound();
  }

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("id", equipment.company_id)
    .maybeSingle<Company>();

  const publicUrl = getEquipmentPublicUrl(equipment.qr_token);
  const qrDataUrl = await generateQrDataUrl(publicUrl);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 py-10 text-center print:min-h-0">
      <div className="flex flex-col items-center gap-3 rounded-lg border p-8 print:border-none">
        <p className="text-sm text-muted-foreground">{company?.name}</p>
        <Image
          src={qrDataUrl}
          alt="Equipment QR code"
          width={320}
          height={320}
          unoptimized
        />
        <p className="text-lg font-semibold">{equipment.name}</p>
        <p className="text-sm text-muted-foreground">Scan for troubleshooting &amp; service</p>
      </div>
      <PrintButton />
    </div>
  );
}
