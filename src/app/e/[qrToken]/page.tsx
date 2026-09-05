import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { after } from "next/server";
import { MapPin, Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { Equipment, ResolvedQrCode } from "@/lib/types";
import { getCompanyPlanFlags } from "@/lib/billing";
import { getPlan } from "@/lib/plans";
import { FEATURES } from "@/lib/features";
import { publicEnv } from "@/lib/env";
import { companyAssetUrl, resolveBranding } from "@/lib/branding";
import { formatRelativeTime } from "@/lib/format";
import { detectScanSource } from "@/lib/public-request";
import { BrandHeader, BrandShell, PoweredBy } from "@/components/public/brand-shell";
import { ClaimCodeCard } from "./claim-code-card";
import { ScanActions } from "./scan-actions";

// The customer-facing landing page. Assume: a phone, one hand free, standing
// in front of a machine that just stopped working, and no idea what EquipQR
// is. So: whose machine is this, which machine is it, and four obvious things
// to do about it. Everything above the fold, no login, no app.

function PublicNotice({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto flex min-h-svh max-w-lg flex-col items-center justify-center gap-2 px-4 py-8 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-muted-foreground">{body}</p>
    </div>
  );
}

export default async function EquipmentGuidePage({
  params,
  searchParams,
}: {
  params: Promise<{ qrToken: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { qrToken } = await params;
  const { src } = await searchParams;
  const supabase = await createClient();

  // Scan tracking runs AFTER the response is finished, so it never blocks or
  // breaks this public page render — and, unlike a bare floating promise,
  // it's guaranteed to actually run: on Vercel the serverless invocation is
  // frozen the moment the response is sent, which silently dropped scans that
  // hadn't landed yet. Errors are still swallowed. record_scan() resolves the
  // company/equipment from the token server-side and no-ops on an unknown one.
  //
  // `headers()` is read here rather than inside the callback: a Server
  // Component can't use request APIs inside after() (see the Next docs for
  // `after`), so the value is captured first and passed in.
  const userAgent = (await headers()).get("user-agent");
  after(async () => {
    try {
      await supabase.rpc("record_scan", {
        p_qr_token: qrToken,
        p_user_agent: userAgent,
        p_source: detectScanSource(qrToken, src),
      });
    } catch {
      // Analytics must never surface to a customer standing at a machine.
    }
  });

  const { data } = await supabase.rpc("resolve_qr_code", { p_token: qrToken });
  const resolved = data as ResolvedQrCode;

  if (!resolved || resolved.status === "not_found") {
    notFound();
  }

  if (resolved.status === "retired") {
    return (
      <PublicNotice
        title="This code has been retired"
        body="This QR code is no longer linked to any equipment. Please contact the service company."
      />
    );
  }

  if (resolved.status === "unclaimed") {
    // The pre-printed batch QR pool (the only way a code ends up unclaimed)
    // is parked for launch — see docs/BATCH-QR.md. Show the same friendly
    // "not set up yet" message a customer would see either way, rather than
    // the staff claim flow.
    const notSetUpYet = (
      <PublicNotice
        title="Not set up yet"
        body="This QR code hasn't been linked to any equipment yet. Please contact the service company."
      />
    );

    if (!FEATURES.batchQr) return notSetUpYet;

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

    if (!isOwnCompanyStaff) return notSetUpYet;

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

  const { guide } = resolved;

  // Billing status (trial expired, subscription lapsed, etc.) must never
  // block this public page — only which *features* are available narrows,
  // and even that fails open to "enabled" if we can't determine the plan.
  const planFlags = await getCompanyPlanFlags(guide.company.id);
  const planAllowsAiChat = planFlags ? getPlan(planFlags.plan_id).features.aiChat : true;

  const branding = resolveBranding({
    company: guide.company,
    planId: planFlags?.plan_id,
    supabaseUrl: publicEnv.NEXT_PUBLIC_SUPABASE_URL,
  });

  const photoUrl = companyAssetUrl(publicEnv.NEXT_PUBLIC_SUPABASE_URL, guide.equipment.photo_path);
  const makeModel = [guide.equipment.make, guide.equipment.model].filter(Boolean).join(" ");
  // "Replaced" stickers still resolve and still work; saying so to a customer
  // would only raise a question they can't act on. Staff see it in the
  // dashboard instead.
  const outOfService =
    guide.equipment.status === "out_of_service" || guide.equipment.status === "retired";

  return (
    <BrandShell branding={branding}>
      <BrandHeader branding={branding} />

      <main className="flex flex-1 flex-col gap-5 px-4 pt-4 pb-2">
        {photoUrl && (
          // Plain <img>: equipment photos live on the Supabase storage
          // origin, which isn't a configured next/image remote pattern.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={guide.equipment.name}
            className="aspect-[4/3] w-full rounded-xl border object-cover"
          />
        )}

        <div className="space-y-1">
          <h1 className="text-2xl leading-tight font-semibold">{guide.equipment.name}</h1>
          <p className="text-muted-foreground">
            {[guide.equipment_type.name, makeModel].filter(Boolean).join(" · ")}
          </p>
          {guide.equipment.location && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-4 shrink-0" aria-hidden />
              {guide.equipment.location}
            </p>
          )}
        </div>

        {outOfService && (
          <div className="rounded-xl border bg-muted/50 px-4 py-3 text-sm">
            <p className="font-medium">This unit is marked out of service.</p>
            <p className="text-muted-foreground">
              {branding.companyName} already knows about it. You can still send an update below.
            </p>
          </div>
        )}

        <ScanActions
          guide={guide}
          qrToken={qrToken}
          branding={branding}
          aiChatEnabled={!!process.env.ANTHROPIC_API_KEY && planAllowsAiChat}
        />

        {guide.equipment.last_serviced_at && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Wrench className="size-4 shrink-0" aria-hidden />
            Last serviced {formatRelativeTime(guide.equipment.last_serviced_at)}
          </p>
        )}
      </main>

      <PoweredBy />
    </BrandShell>
  );
}
