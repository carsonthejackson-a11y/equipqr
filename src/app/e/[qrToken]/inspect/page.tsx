import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ChecklistTemplate, ResolvedQrCode, UserRole } from "@/lib/types";
import { InspectFlow } from "./inspect-flow";

/**
 * Same idea as ../page.tsx's getScanningStaff() — copied rather than
 * imported, per docs/NEXT-ROADMAP-BRIEF.md (that file is workstream A's and
 * isn't touched here). A logged-in member of the equipment's own company.
 */
async function getScanningStaff(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string
): Promise<{ userId: string; role: UserRole; fullName: string | null } | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id, role, full_name")
    .eq("id", user.id)
    .maybeSingle<{ company_id: string; role: UserRole; full_name: string | null }>();
  if (!profile || profile.company_id !== companyId) return null;
  return { userId: user.id, role: profile.role, fullName: profile.full_name };
}

export default async function InspectPage({
  params,
  searchParams,
}: {
  params: Promise<{ qrToken: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { qrToken } = await params;
  const { request: requestParam } = await searchParams;
  const supabase = await createClient();

  const { data } = await supabase.rpc("resolve_qr_code", { p_token: qrToken });
  const resolved = data as ResolvedQrCode;

  if (!resolved || resolved.status !== "claimed") {
    notFound();
  }

  const { guide } = resolved;

  const staff = await getScanningStaff(supabase, guide.company.id);
  if (!staff) {
    redirect(`/login?next=${encodeURIComponent(`/e/${qrToken}/inspect`)}`);
  }

  const { data: templates } = await supabase
    .from("checklist_templates")
    .select("*")
    .eq("company_id", guide.company.id)
    .eq("active", true)
    .or(`equipment_type_id.eq.${guide.equipment_type.id},equipment_type_id.is.null`)
    .order("name")
    .returns<ChecklistTemplate[]>();

  // ?request=<id> lets workstream A's staff scan view deep-link "Start
  // inspection" from an open request. Verified server-side (belongs to this
  // equipment) before InspectFlow ever sees it.
  const requestIdParam = typeof requestParam === "string" ? requestParam : null;
  let serviceRequestId: string | null = null;
  if (requestIdParam) {
    const { data: linkedRequest } = await supabase
      .from("service_requests")
      .select("id")
      .eq("id", requestIdParam)
      .eq("equipment_id", guide.equipment.id)
      .maybeSingle();
    serviceRequestId = linkedRequest?.id ?? null;
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-lg flex-col px-4 py-6">
      <InspectFlow
        qrToken={qrToken}
        companyId={guide.company.id}
        equipmentId={guide.equipment.id}
        equipmentName={guide.equipment.name}
        templates={templates ?? []}
        serviceRequestId={serviceRequestId}
      />
    </div>
  );
}
