import { notFound } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { generateQrDataUrl, getEquipmentPublicUrl } from "@/lib/qr";
import { BackLink } from "@/components/back-link";
import type { Customer, Equipment, Company } from "@/lib/types";
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

  const [{ data: company }, { data: customer }] = await Promise.all([
    supabase.from("companies").select("*").eq("id", equipment.company_id).maybeSingle<Company>(),
    equipment.customer_id
      ? supabase.from("customers").select("*").eq("id", equipment.customer_id).maybeSingle<Customer>()
      : Promise.resolve({ data: null }),
  ]);

  const publicUrl = getEquipmentPublicUrl(equipment.qr_token);
  const qrDataUrl = await generateQrDataUrl(publicUrl);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 py-10 text-center print:min-h-0">
      <div className="w-full max-w-md print:hidden">
        <BackLink href={`/dashboard/equipment/${equipment.id}`} label="Back to equipment" />
      </div>
      <div className="flex flex-col items-center gap-3 rounded-lg border p-8 print:border-none">
        <p className="text-base text-muted-foreground">{company?.name}</p>
        <Image
          src={qrDataUrl}
          alt="Equipment QR code"
          width={320}
          height={320}
          unoptimized
        />
        <p className="text-2xl font-semibold">{equipment.name}</p>
        <p className="text-base text-muted-foreground">Scan for troubleshooting &amp; service</p>
        {customer && <p className="text-xl font-medium">{customer.name}</p>}
      </div>
      <PrintButton />
    </div>
  );
}
