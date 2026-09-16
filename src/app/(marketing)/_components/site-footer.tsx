import Link from "next/link";
import { Logo } from "@/components/logo";
import { SUPPORT_EMAIL } from "@/lib/site";
import { Container } from "./container";

// README "SiteFooter" / SiteFooter.dc.html. Server component: brand column,
// three link columns, then the faded rule and the copyright row.

const columns: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/pricing", label: "Pricing" },
      { href: "/restaurants", label: "For restaurants" },
      { href: "/faq", label: "FAQ" },
      { href: "/security", label: "Security" },
      { href: "/e", label: "Have a sticker code?" },
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

const footerLinkClass = "w-max text-sm text-eq-neutral-300 transition-colors duration-150 hover:text-eq-text";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-eq-divider">
      <Container className="pt-14 pb-10">
        <div className="flex flex-wrap gap-[40px_56px]">
          <div className="flex max-w-[340px] flex-[1_1_260px] flex-col gap-[14px]">
            <Link href="/" aria-label="EquipQR home" className="w-max">
              <Logo markClassName="size-6 text-eq-accent" wordmarkClassName="text-lg" />
            </Link>
            <p className="text-sm leading-[1.6] text-eq-neutral-400">
              QR tags for commercial kitchen equipment. Scan for the troubleshooting guide, or send a
              service request to whoever handles that unit.
            </p>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="w-max text-sm text-eq-neutral-400 transition-colors duration-150 hover:text-eq-text"
            >
              {SUPPORT_EMAIL}
            </a>
          </div>

          <div className="flex flex-[2_1_420px] flex-wrap gap-[32px_48px]">
            {columns.map((col) => (
              <div key={col.title} className="flex flex-[1_1_120px] flex-col gap-3">
                <p className="text-xs font-medium tracking-[0.08em] text-eq-neutral-500 uppercase">
                  {col.title}
                </p>
                <ul className="flex flex-col gap-3">
                  {col.links.map((link) => (
                    <li key={link.href} className="flex">
                      <Link href={link.href} className={footerLinkClass}>
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <hr className="eq-rule mt-9 mb-[22px]" />

        <div className="flex flex-wrap justify-between gap-[8px_24px] text-[13px] text-eq-neutral-500">
          <span>© {year} EquipQR. All rights reserved.</span>
          <span>Built by a working repair technician in Dallas–Fort Worth.</span>
        </div>
      </Container>
    </footer>
  );
}
