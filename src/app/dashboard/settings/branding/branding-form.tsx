"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImageIcon, Trash2, Upload } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_BRAND_COLOR, MIN_AA_CONTRAST, companyAssetUrl, contrastRatio, phoneHref, resolveBranding } from "@/lib/branding";
import type { Company } from "@/lib/types";
import { upgradeCopyFor, type PlanId } from "@/lib/plans";
import { removeCompanyLogo, setCompanyLogo, updateBranding } from "./actions";

const MAX_LOGO_BYTES = 1 * 1024 * 1024;
const ACCEPTED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
};

export function BrandingForm({
  company,
  entitled,
  planId,
  supabaseUrl,
}: {
  company: Company;
  entitled: boolean;
  planId: PlanId | null;
  supabaseUrl: string;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoPath, setLogoPath] = useState(company.logo_path);
  const [brandColor, setBrandColor] = useState(company.brand_color ?? DEFAULT_BRAND_COLOR);
  const [uploading, setUploading] = useState(false);
  const [savingColor, setSavingColor] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = resolveBranding({
    company: {
      name: company.name,
      phone: company.phone,
      sms_number: company.sms_number,
      website: company.website,
      logo_path: logoPath,
      brand_color: brandColor,
    },
    planId,
    supabaseUrl,
  });

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError(null);

    const ext = ACCEPTED_TYPES[file.type];
    if (!ext) {
      setError("Logo must be a PNG, JPG, or SVG file");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError("Logo must be 1MB or smaller");
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();
      const path = `${company.id}/branding/logo-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("company-assets")
        .upload(path, file, { contentType: file.type });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const result = await setCompanyLogo(path);
      if (result?.error) {
        // Clean up the just-uploaded object since the DB write didn't take.
        await supabase.storage.from("company-assets").remove([path]);
        throw new Error(result.error);
      }

      setLogoPath(path);
      toast.success("Logo updated");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload logo");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemoveLogo() {
    setRemoving(true);
    setError(null);
    const result = await removeCompanyLogo();
    setRemoving(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setLogoPath(null);
    toast.success("Logo removed");
    router.refresh();
  }

  async function handleSaveColor(formData: FormData) {
    setError(null);
    setSavingColor(true);
    const result = await updateBranding(formData);
    setSavingColor(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    toast.success("Brand color saved");
    router.refresh();
  }

  const logoUrl = companyAssetUrl(supabaseUrl, logoPath);
  const isValidHex = /^#[0-9a-fA-F]{6}$/.test(brandColor);
  const whiteTextContrast = isValidHex ? contrastRatio(brandColor, "#ffffff") : null;
  const lowContrast = whiteTextContrast !== null && whiteTextContrast < MIN_AA_CONTRAST;

  return (
    <div className="space-y-6">
      {!entitled && (
        <Alert>
          <AlertTitle>Branding isn&apos;t on your plan yet</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2">
            <span>
              {/* Names this account's OWN kind's plans, never a plan it could never buy (C1-06). */}
              {upgradeCopyFor(company.kind, "branding") ?? "Upgrade your plan"} to put your logo and brand
              color on customer-facing pages. You can still see how it would look below.
            </span>
            <Button size="sm" render={<a href="/dashboard/settings/billing">View plans</a>} />
          </AlertDescription>
        </Alert>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Logo</CardTitle>
              <CardDescription>PNG, JPG, or SVG, up to 1MB.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt="Company logo" className="size-full object-contain" />
                  ) : (
                    <ImageIcon className="size-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml"
                    className="hidden"
                    disabled={!entitled || uploading}
                    onChange={handleFileSelected}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!entitled || uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload />
                    {uploading ? "Uploading…" : logoPath ? "Replace logo" : "Upload logo"}
                  </Button>
                  {logoPath && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={!entitled || removing}
                      onClick={handleRemoveLogo}
                    >
                      <Trash2 className="text-destructive" />
                      {removing ? "Removing…" : "Remove logo"}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Brand color</CardTitle>
              <CardDescription>Used for the header and buttons on customer-facing pages.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={handleSaveColor} className="space-y-4">
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    aria-label="Brand color picker"
                    value={isValidHex ? brandColor : DEFAULT_BRAND_COLOR}
                    disabled={!entitled}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="size-9 shrink-0 cursor-pointer rounded border border-input bg-transparent p-1 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor="brandColor" className="sr-only">
                      Brand color hex
                    </Label>
                    <Input
                      id="brandColor"
                      name="brandColor"
                      value={brandColor}
                      disabled={!entitled}
                      onChange={(e) => setBrandColor(e.target.value)}
                      placeholder={DEFAULT_BRAND_COLOR}
                      aria-describedby={lowContrast ? "brandColor-contrast-warning" : undefined}
                      className="font-mono"
                    />
                  </div>
                </div>
                {lowContrast && (
                  <p id="brandColor-contrast-warning" className="text-sm text-amber-600 dark:text-amber-500">
                    White text on this color is {whiteTextContrast!.toFixed(2)}:1 — under the 4.5:1 the guide text
                    needs to stay readable. Customers with low vision or in bright sunlight may struggle to read
                    it. Consider a darker shade.
                  </p>
                )}
                <Button type="submit" size="sm" disabled={!entitled || savingColor}>
                  {savingColor ? "Saving…" : "Save color"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>What customers see at the top of the scan and status pages.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border">
              <div
                className="flex items-center gap-3 px-4 py-3"
                style={{ backgroundColor: preview.brandColor, color: preview.onBrandColor }}
              >
                {preview.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview.logoUrl} alt="" className="size-8 rounded bg-white/90 object-contain p-0.5" />
                ) : (
                  <div className="flex size-8 items-center justify-center rounded bg-white/20 text-sm font-semibold">
                    {preview.companyName.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <span className="font-semibold">{preview.companyName}</span>
              </div>
              <div className="space-y-3 bg-background p-4">
                <p className="text-sm font-medium">Espresso Machine #12</p>
                <p className="text-sm text-muted-foreground">Tap a step below, or:</p>
                <div className="flex flex-wrap gap-2">
                  {preview.phone && (
                    <Button
                      size="sm"
                      variant="outline"
                      render={<a href={phoneHref("tel", preview.phone)}>Call us</a>}
                    />
                  )}
                  {preview.smsNumber && (
                    <Button
                      size="sm"
                      variant="outline"
                      render={<a href={phoneHref("sms", preview.smsNumber)}>Text us</a>}
                    />
                  )}
                  <Button size="sm" style={{ backgroundColor: preview.brandColor, color: preview.onBrandColor }}>
                    Report a problem
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
