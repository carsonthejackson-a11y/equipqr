import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Equipment, ResolvedQrCode } from "@/lib/types";
import { getCompanyPlanFlags } from "@/lib/billing";
import { getPlan } from "@/lib/plans";
import { GuideWalkthrough } from "./guide-walkthrough";
import { ClaimCodeCard } from "./claim-code-card";

export default async function EquipmentGuidePage({
  params,
}: {
  params: Promise<{ qrToken: string }>;
}) {
  const { qrToken } = await params;
  const supabase = await createClient();

  const { data } = await supabase.rpc("resolve_qr_code", { p_token: qrToken });
  const resolved = data as ResolvedQrCode;

  if (!resolved || resolved.status === "not_found") {
    notFound();
  }

  if (resolved.status === "unclaimed") {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let isOwnCompanyStaff = false;
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user.id)
        .maybeSingle();
      isOwnCompanyStaff = profile?.company_id === resolved.company_id;
    }

    if (!isOwnCompanyStaff) {
      return (
        <div className="mx-auto flex min-h-svh max-w-lg flex-col items-center justify-center gap-2 px-4 py-8 text-center">
          <h1 className="text-xl font-semibold">Not set up yet</h1>
          <p className="text-muted-foreground">
            This QR code hasn&apos;t been linked to any equipment yet. Please contact the service
            company.
          </p>
        </div>
      );
    }

    const { data: assignedCodes } = await supabase
      .from("qr_codes")
      .select("equipment_id")
      .eq("company_id", resolved.company_id)
      .not("equipment_id", "is", null);

    const assignedEquipmentIds = (assignedCodes ?? [])
      .map((c) => c.equipment_id)
      .filter((id): id is string => id !== null);

    let equipmentQuery = supabase
      .from("equipment")
      .select("*")
      .eq("company_id", resolved.company_id)
      .order("name");

    if (assignedEquipmentIds.length > 0) {
      equipmentQuery = equipmentQuery.not("id", "in", `(${assignedEquipmentIds.join(",")})`);
    }

    const { data: unassignedEquipment } = await equipmentQuery.returns<Equipment[]>();

    return (
      <div className="mx-auto flex min-h-svh max-w-lg flex-col px-4 py-8">
        <ClaimCodeCard token={qrToken} unassignedEquipment={unassignedEquipment ?? []} />
      </div>
    );
  }

  // Billing status (trial expired, subscription lapsed, etc.) must never
  // block this public page — only which *features* are available narrows,
  // and even that fails open to "enabled" if we can't determine the plan.
  const planFlags = await getCompanyPlanFlags(resolved.guide.company.id);
  const planAllowsAiChat = planFlags ? getPlan(planFlags.plan_id).features.aiChat : true;

  return (
    <div className="mx-auto flex min-h-svh max-w-lg flex-col px-4 py-8">
      <GuideWalkthrough
        guide={resolved.guide}
        qrToken={qrToken}
        aiChatEnabled={!!process.env.ANTHROPIC_API_KEY && planAllowsAiChat}
      />
    </div>
  );
}
