import { requireOwner } from "@/lib/auth";
import { getEntitlements, hasFeature } from "@/lib/billing";
import { FEATURES } from "@/lib/features";
import { createClient } from "@/lib/supabase/server";
import { formatShortCode } from "@/lib/qr";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { OwnerOnlyCard } from "@/components/owner-only-card";
import type { QrCode as QrCodeRow } from "@/lib/types";
import { SettingsSubnav } from "../settings-subnav";
import { BlankCodesManager, type BlankCodeRow } from "./blank-codes-manager";

export const metadata = { title: "Blank codes" };

export default async function BlankQrCodesPage() {
  const ctx = await requireOwner();

  const entitlements = ctx ? await getEntitlements() : null;
  const entitled = FEATURES.batchQr && hasFeature(entitlements, "batchQr");

  let rows: BlankCodeRow[] = [];
  if (ctx && entitled) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("qr_codes")
      .select("*")
      .eq("source", "batch")
      .eq("status", "active")
      .is("equipment_id", null)
      .order("created_at", { ascending: false })
      .returns<QrCodeRow[]>();

    rows = (data ?? []).map((code) => ({
      id: code.id,
      shortCode: formatShortCode(code.short_code),
      createdAt: code.created_at,
    }));
  }

  return (
    <div className="space-y-6">
      <SettingsSubnav />
      <div>
        <h1 className="text-2xl font-semibold">Blank codes</h1>
        <p className="text-muted-foreground">
          Pre-print a batch of QR stickers before you visit a site, and link each one to a unit
          later — either by hand, or by scanning it and photographing the nameplate.
        </p>
      </div>

      {!ctx ? (
        <OwnerOnlyCard message="Only company owners can generate a batch of blank codes." />
      ) : !entitled ? (
        <Alert>
          <AlertTitle>Blank code batches are a Pro feature</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2">
            <span>
              Upgrade to Pro or Business to pre-print a pool of stickers ahead of a route. Every
              plan can still generate and print a code for a unit the moment you add it.
            </span>
            <Button size="sm" render={<a href="/dashboard/settings/billing">View plans</a>} />
          </AlertDescription>
        </Alert>
      ) : (
        <BlankCodesManager rows={rows} />
      )}
    </div>
  );
}
