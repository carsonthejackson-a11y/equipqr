import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FEATURES } from "@/lib/features";
import type { Customer, EquipmentType, ResolvedQrCode } from "@/lib/types";
import { OnboardFlow } from "./onboard-flow";

// Staff-only: a technician who just scanned an unclaimed pre-printed sticker
// photographs the nameplate and adds the unit right there, then this same
// code gets claimed to it. Mirrors the auth check ./page.tsx uses for staff
// scan mode (no shared helper — that file is off-limits to every workstream
// but the one that owns it, see docs/NEXT-ROADMAP-BRIEF.md).
export default async function OnboardPage({
  params,
}: {
  params: Promise<{ qrToken: string }>;
}) {
  const { qrToken } = await params;

  if (!FEATURES.batchQr) {
    notFound();
  }

  const supabase = await createClient();

  const { data } = await supabase.rpc("resolve_qr_code", { p_token: qrToken });
  const resolved = data as ResolvedQrCode;

  if (!resolved || resolved.status === "not_found") {
    notFound();
  }

  // Already set up, or dead — nothing to onboard here. Send them to the
  // normal scan page, which will show the right thing either way.
  if (resolved.status !== "unclaimed") {
    redirect(`/e/${qrToken}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/e/${qrToken}/onboard`)}`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .maybeSingle<{ company_id: string }>();

  if (!profile || profile.company_id !== resolved.company_id) {
    // Not staff of the company this sticker belongs to — same "not set up
    // yet" experience a customer would get, not a claim/onboard flow.
    redirect(`/e/${qrToken}`);
  }

  const [{ data: equipmentTypes }, { data: customers }] = await Promise.all([
    supabase.from("equipment_types").select("*").order("name").returns<EquipmentType[]>(),
    supabase.from("customers").select("*").order("name").returns<Customer[]>(),
  ]);

  return (
    <div className="mx-auto flex min-h-svh max-w-lg flex-col px-4 py-6">
      <OnboardFlow
        token={qrToken}
        equipmentTypes={equipmentTypes ?? []}
        customers={customers ?? []}
      />
    </div>
  );
}
