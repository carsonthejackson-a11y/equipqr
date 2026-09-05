import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { ResolvedQrCode } from "@/lib/types";
import { getCompanyPlanFlags } from "@/lib/billing";
import { publicEnv } from "@/lib/env";
import { resolveBranding } from "@/lib/branding";
import { BrandHeader, BrandShell, PoweredBy } from "@/components/public/brand-shell";
import { ServiceRequestForm } from "./service-request-form";

export default async function ServiceRequestPage({
  params,
}: {
  params: Promise<{ qrToken: string }>;
}) {
  const { qrToken } = await params;
  const supabase = await createClient();

  const { data } = await supabase.rpc("resolve_qr_code", { p_token: qrToken });
  const resolved = data as ResolvedQrCode;

  if (!resolved || resolved.status !== "claimed") {
    notFound();
  }

  const { guide } = resolved;
  const planFlags = await getCompanyPlanFlags(guide.company.id);
  const branding = resolveBranding({
    company: guide.company,
    planId: planFlags?.plan_id,
    supabaseUrl: publicEnv.NEXT_PUBLIC_SUPABASE_URL,
  });

  return (
    <BrandShell branding={branding}>
      <BrandHeader branding={branding} />

      <main className="flex flex-1 flex-col gap-5 px-4 pt-4 pb-2">
        <div>
          <Link
            href={`/e/${qrToken}`}
            className="-ml-1 inline-flex min-h-[44px] items-center gap-1.5 px-1 text-sm font-medium text-muted-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back
          </Link>
          <h1 className="text-2xl leading-tight font-semibold">Report a problem</h1>
          <p className="text-muted-foreground">{guide.equipment.name}</p>
        </div>

        <ServiceRequestForm qrToken={qrToken} branding={branding} />
      </main>

      <PoweredBy />
    </BrandShell>
  );
}
