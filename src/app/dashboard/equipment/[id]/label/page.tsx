import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { formatShortCode, generateQrDataUrl, getEquipmentPublicUrl } from "@/lib/qr";
import { companyAssetUrl } from "@/lib/branding";
import { serverEnv } from "@/lib/env";
import { BackLink } from "@/components/back-link";
import { Button } from "@/components/ui/button";
import {
  STICKER_SIZE_LIST,
  appHost,
  getStickerSize,
  stickerPageCss,
} from "@/lib/labels/sticker-sizes";
import type { Company, Equipment, QrCode } from "@/lib/types";
import { PrintButton } from "./print-button";

export default async function EquipmentLabelPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ size?: string }>;
}) {
  const [{ id }, { size: sizeParam }] = await Promise.all([params, searchParams]);
  const size = getStickerSize(sizeParam);
  const supabase = await createClient();

  const { data: equipment } = await supabase
    .from("equipment")
    .select("*")
    .eq("id", id)
    .maybeSingle<Equipment>();

  if (!equipment) {
    notFound();
  }

  const [{ data: company }, { data: qrCode }] = await Promise.all([
    supabase.from("companies").select("*").eq("id", equipment.company_id).maybeSingle<Company>(),
    supabase
      .from("qr_codes")
      .select("*")
      .eq("equipment_id", id)
      .eq("status", "active")
      .maybeSingle<QrCode>(),
  ]);

  if (!qrCode) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 py-10 text-center">
        <BackLink href={`/dashboard/equipment/${equipment.id}`} label="Back to equipment" />
        <p className="text-muted-foreground">This equipment doesn&apos;t have a QR code linked yet.</p>
      </div>
    );
  }

  const publicUrl = getEquipmentPublicUrl(qrCode.token);
  // The QR is rendered at ~4x its printed size so a 600dpi label printer has
  // real pixels to work with rather than an upscaled 240px bitmap.
  const qrDataUrl = await generateQrDataUrl(publicUrl, { width: 900 });
  const shortCode = formatShortCode(qrCode.short_code);
  // Not plan-gated: this is the company printing its own sticker, not a
  // customer-facing surface (contrast resolveBranding() in src/lib/branding.ts).
  const logoUrl = companyAssetUrl(serverEnv.NEXT_PUBLIC_SUPABASE_URL, company?.logo_path);
  const host = appHost(serverEnv.NEXT_PUBLIC_APP_URL);
  const minimal = size.layout === "minimal";

  return (
    <div className="flex flex-col items-center gap-6 py-6 print:gap-0 print:py-0">
      {/* `size` fixes the paper the print dialog offers; `margin: 0` stops the
          browser adding its own and shrinking the sticker to fit. */}
      <style dangerouslySetInnerHTML={{ __html: stickerPageCss(size) }} />

      <div className="w-full max-w-xl space-y-4 print:hidden">
        <BackLink href={`/dashboard/equipment/${equipment.id}`} label="Back to equipment" />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Print a label</h1>
            <p className="text-muted-foreground">
              Choose a sticker size, then print. Set your printer to 100% scale (not
              &ldquo;fit to page&rdquo;) so the code comes out at true size.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {STICKER_SIZE_LIST.map((option) => (
            <Button
              key={option.id}
              render={
                <Link href={`/dashboard/equipment/${equipment.id}/label?size=${option.id}`} />
              }
              nativeButton={false}
              variant={option.id === size.id ? "secondary" : "outline"}
              size="sm"
              title={option.description}
            >
              {option.name}
            </Button>
          ))}
        </div>
      </div>

      {/* The sticker itself: sized in inches so what's on screen is exactly
          what comes out of the printer. */}
      <div
        className="flex flex-col overflow-hidden border border-dashed border-border bg-white text-black print:border-0"
        style={{
          width: `${size.widthIn}in`,
          height: `${size.heightIn}in`,
          padding: minimal ? "0.05in" : "0.09in",
        }}
      >
        {minimal ? (
          <div className="flex h-full flex-col items-center justify-center gap-[0.03in]">
            <Image
              src={qrDataUrl}
              alt=""
              width={900}
              height={900}
              unoptimized
              style={{ width: `${size.qrIn}in`, height: `${size.qrIn}in` }}
            />
            <p
              className="font-mono font-bold leading-none tracking-[0.06em]"
              style={{ fontSize: "0.1in" }}
            >
              {shortCode}
            </p>
          </div>
        ) : (
          <>
            <header
              className="flex shrink-0 items-center justify-center"
              style={{ height: "0.24in" }}
            >
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL printed at a fixed physical size; next/image adds nothing here.
                <img
                  src={logoUrl}
                  alt={company?.name ?? ""}
                  className="max-h-full w-auto object-contain"
                />
              ) : (
                <p className="truncate font-semibold leading-none" style={{ fontSize: "0.13in" }}>
                  {company?.name}
                </p>
              )}
            </header>

            <div className="flex min-h-0 flex-1 items-center gap-[0.09in]">
              <Image
                src={qrDataUrl}
                alt=""
                width={900}
                height={900}
                unoptimized
                className="shrink-0"
                style={{ width: `${size.qrIn}in`, height: `${size.qrIn}in` }}
              />
              <div className="min-w-0 flex-1">
                <p
                  className="truncate font-semibold leading-tight"
                  style={{ fontSize: "0.115in" }}
                >
                  {equipment.name}
                </p>
                <p className="leading-tight text-neutral-600" style={{ fontSize: "0.075in" }}>
                  Scan for help &amp; service
                </p>
                <p
                  className="mt-[0.05in] font-mono font-bold leading-none tracking-[0.05em]"
                  style={{ fontSize: "0.145in" }}
                >
                  {shortCode}
                </p>
                <p className="leading-tight text-neutral-600" style={{ fontSize: "0.062in" }}>
                  or enter this code at {host}
                </p>
              </div>
            </div>

            <footer
              className="flex shrink-0 items-end justify-between gap-[0.06in] border-t border-neutral-300 pt-[0.04in]"
              style={{ fontSize: "0.07in" }}
            >
              {company?.phone ? (
                <span className="shrink-0 font-semibold">Call {company.phone}</span>
              ) : (
                <span />
              )}
              <span className="flex min-w-0 flex-1 items-end justify-end gap-[0.04in] text-neutral-600">
                <span className="shrink-0">Location:</span>
                {equipment.location ? (
                  <span className="truncate text-black">{equipment.location}</span>
                ) : (
                  // Blank rule to write on when the unit has no recorded location.
                  <span className="min-w-[0.7in] flex-1 border-b border-neutral-400" />
                )}
              </span>
            </footer>
          </>
        )}
      </div>

      <PrintButton codeId={qrCode.id} equipmentId={equipment.id} />
    </div>
  );
}
