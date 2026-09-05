import type { CSSProperties, ReactNode } from "react";
import { Phone, MessageSquare } from "lucide-react";
import { phoneHref, type ResolvedBranding } from "@/lib/branding";
import { cn } from "@/lib/utils";

// The chrome every customer-facing page shares: the scan landing page, the
// request form and the /r/<token> status page. All three belong to the
// *service company*, not to EquipQR, so the accent colour comes from the
// company's branding via a `--brand` custom property rather than the app's
// own teal `--primary`. Nothing in here may assume the app palette.
//
// Server components — no client JS needed for any of it.

/** Inline style carrying the company's colours down to every `bg-[var(--brand)]` below. */
export function brandStyle(branding: ResolvedBranding): CSSProperties {
  return {
    "--brand": branding.brandColor,
    "--brand-on": branding.onBrandColor,
  } as CSSProperties;
}

/** Full-height mobile-first page frame with the brand custom properties applied. */
export function BrandShell({
  branding,
  children,
  className,
}: {
  branding: ResolvedBranding;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div style={brandStyle(branding)} className="min-h-svh bg-background">
      <div className={cn("mx-auto flex min-h-svh w-full max-w-lg flex-col", className)}>{children}</div>
    </div>
  );
}

/**
 * Company logo when they have one and their plan includes branding,
 * otherwise their name. Either way the customer sees who they're dealing
 * with in the first inch of the page.
 */
export function BrandHeader({ branding }: { branding: ResolvedBranding }) {
  return (
    <header className="flex items-center gap-3 border-b px-4 py-3">
      {branding.logoUrl ? (
        // Plain <img>: the logo lives on the Supabase storage origin, which
        // isn't configured as a next/image remote pattern.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={branding.logoUrl}
          alt={branding.companyName}
          className="h-9 w-auto max-w-[180px] object-contain"
        />
      ) : (
        <>
          <span
            aria-hidden
            className="inline-block h-6 w-1.5 rounded-full bg-[var(--brand)]"
          />
          <span className="text-base font-semibold">{branding.companyName}</span>
        </>
      )}
    </header>
  );
}

export function PoweredBy() {
  return (
    <footer className="mt-auto px-4 pt-8 pb-6 text-center text-xs text-muted-foreground">
      Powered by EquipQR
    </footer>
  );
}

const CONTACT_CLASS =
  "flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-base font-medium transition-colors active:translate-y-px";

/**
 * "Call us" / "Text us". Rendered as plain anchors so they work with no JS
 * and hand off to the phone's dialer / messages app directly.
 */
export function ContactActions({
  branding,
  className,
}: {
  branding: ResolvedBranding;
  className?: string;
}) {
  if (!branding.phone && !branding.smsNumber) return null;

  return (
    <div className={cn("flex gap-3", className)}>
      {branding.phone && (
        <a href={phoneHref("tel", branding.phone)} className={cn(CONTACT_CLASS, "border-transparent bg-[var(--brand)] text-[var(--brand-on)]")}>
          <Phone className="size-5" aria-hidden />
          Call us
        </a>
      )}
      {branding.smsNumber && (
        <a href={phoneHref("sms", branding.smsNumber)} className={cn(CONTACT_CLASS, "bg-background hover:bg-muted")}>
          <MessageSquare className="size-5" aria-hidden />
          Text us
        </a>
      )}
    </div>
  );
}
