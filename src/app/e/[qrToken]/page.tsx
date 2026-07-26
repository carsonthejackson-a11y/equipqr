import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { EquipmentGuideResponse } from "@/lib/types";
import { GuideWalkthrough } from "./guide-walkthrough";

export default async function EquipmentGuidePage({
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
      <GuideWalkthrough guide={guide} />
    </div>
  );
}
