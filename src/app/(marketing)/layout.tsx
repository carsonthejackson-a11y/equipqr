import { Inter, DM_Sans } from "next/font/google";
import { cn } from "@/lib/utils";
import { SiteHeader } from "./_components/site-header";
import { SiteFooter } from "./_components/site-footer";

// Marketing typography (docs/design/marketing-2026-09/BRIEF.md D2): Inter for
// all UI and copy, DM Sans 500 reserved for the wordmark. Both are loaded here
// rather than in the root layout so the dashboard, auth and public scan pages
// keep Geist. The variables are read by `.theme-nocturne` (globals.css) and
// by the Logo wordmark. Inter is a variable Google font, so no `weight` list
// is needed (README: never bolder than 500).
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

// Wordmark only (two short strings per page), so it is not worth a preload
// hint competing with the CSS on slow connections.
const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: "500",
  display: "swap",
  preload: false,
  variable: "--font-dm-sans",
});

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    // `dark theme-nocturne`: the scoped Nocturne token set (BRIEF D1) plus
    // shadcn's dark: refinements. `.theme-nocturne` is declared after `.dark`
    // in globals.css so its variables win.
    <div
      className={cn(
        "dark theme-nocturne eq-page-ground",
        inter.variable,
        dmSans.variable,
        "flex min-h-svh flex-col text-eq-text"
      )}
    >
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
