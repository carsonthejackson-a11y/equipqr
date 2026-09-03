import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { SUPPORT_EMAIL } from "@/lib/site";

const columns: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/pricing", label: "Pricing" },
      { href: "/faq", label: "FAQ" },
      { href: "/security", label: "Security" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/terms", label: "Terms of service" },
      { href: "/privacy", label: "Privacy policy" },
    ],
  },
];

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/80">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="space-y-3">
            <Link href="/" className="flex items-center gap-2">
              <LogoMark />
              <span className="font-heading text-lg font-semibold leading-none">EquipQR</span>
            </Link>
            <p className="max-w-xs text-sm text-muted-foreground">
              QR stickers that turn every unit you service into a self-serve troubleshooting
              guide — and a lead for the next truck roll.
            </p>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="inline-block text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {SUPPORT_EMAIL}
            </a>
          </div>

          {columns.map((col) => (
            <div key={col.title} className="space-y-3">
              <p className="text-sm font-medium text-foreground">{col.title}</p>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-border/80 pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} EquipQR. All rights reserved.</p>
          <p>Built by a working repair technician in Dallas–Fort Worth.</p>
        </div>
      </div>
    </footer>
  );
}
