import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { EquipmentGuideResponse } from "@/lib/types";
import { ServiceRequestForm } from "./service-request-form";

export default async function ServiceRequestPage({
  params,
}: {
  params: Promise<{ qrToken: string }>;
}) {
  const { qrToken } = await params;
  const supabase = await createClient();

  const { data } = await supabase.rpc("get_equipment_guide", {
    p_qr_token: qrToken,
  });

  const guide = data as EquipmentGuideResponse;

  if (!guide) {
    notFound();
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-lg flex-col px-4 py-8">
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">{guide.company.name}</p>
        <h1 className="text-xl font-semibold">Request service for {guide.equipment.name}</h1>
        <p className="text-sm text-muted-foreground">
          Add a description and any photos or videos that show the problem.
        </p>
      </div>

      <ServiceRequestForm qrToken={qrToken} />
    </div>
  );
}
