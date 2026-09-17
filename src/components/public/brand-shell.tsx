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

/**
 * Inline style carrying the company's colours down to every
 * `bg-[var(--brand)]` below — and, per C1-49, also overriding the app's own
 * `--primary` / `--primary-foreground` / `--ring` tokens. Without this a
 * control that only knows the app palette (a default `<Button>`, a focus
 * ring) sits teal next to a brand-coloured one on the same screen; every
 * shadcn primitive already reads `--primary`/`--ring`, so overriding the
 * tokens here — rather than hunting down every call site — covers all of
 * them, including ones this workstream doesn't touch (e.g. `/r/`'s Send).
 */
export function brandStyle(branding: ResolvedBranding): CSSProperties {
  return {
    "--brand": branding.brandColor,
    "--brand-on": branding.onBrandColor,
    "--primary": branding.brandColor,
    "--primary-foreground": branding.onBrandColor,
    "--ring": branding.brandColor,
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
 * Company logo (when they have one and their plan includes branding) AND
 * their name next to it — a logo alone doesn't say who "us" is (Q-56), and a
 * name-only company still gets the accent mark for visual weight. Either way
 * the customer sees who they're dealing with in the first inch of the page.
 */
export function BrandHeader({ branding }: { branding: ResolvedBranding }) {
  return (
    <header className="flex items-center gap-3 border-b px-4 py-3">
      {branding.logoUrl ? (
        // Plain <img>: the logo lives on the Supabase storage origin, which
        // isn't configured as a next/image remote pattern. alt="" — the
        // company name is always rendered as visible text right next to it,
        // so the logo itself is decorative and shouldn't be announced twice.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={branding.logoUrl}
          alt=""
          className="h-9 w-auto max-w-[140px] shrink-0 object-contain"
        />
      ) : (
        <span
          aria-hidden
          className="inline-block h-6 w-1.5 shrink-0 rounded-full bg-[var(--brand)]"
        />
      )}
      <span
        className={cn(
          "truncate font-semibold",
          branding.logoUrl ? "text-sm text-muted-foreground" : "text-base"
        )}
      >
        {branding.companyName}
      </span>
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
  "flex min-h-[52px] min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-base font-medium transition-colors active:translate-y-px";

/**
 * "Call {company}" / "Text {company}" (Q-56) — "Call us" doesn't say who
 * "us" is once the page also shows a logo. Rendered as plain anchors so they
 * work with no JS and hand off to the phone's dialer / messages app
 * directly. `min-w-0` + `truncate` on the label keep a long company name
 * from breaking the two-up layout at 390px.
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
          <Phone className="size-5 shrink-0" aria-hidden />
          <span className="truncate">Call {branding.companyName}</span>
        </a>
      )}
      {branding.smsNumber && (
        <a href={phoneHref("sms", branding.smsNumber)} className={cn(CONTACT_CLASS, "bg-background hover:bg-muted")}>
          <MessageSquare className="size-5 shrink-0" aria-hidden />
          <span className="truncate">Text {branding.companyName}</span>
        </a>
      )}
    </div>
  );
}
