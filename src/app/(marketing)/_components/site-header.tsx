"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";
import { Container } from "./container";
import { Icon } from "./icon";

// README "SiteHeader" / SiteHeader.dc.html. Sticky 64px blurred bar; the
// desktop nav + buttons swap for a 44px menu button and a panel under the
// header at <= 880px (BRIEF WS4: the breakpoint is 880/881, not Tailwind `md`).

const navLinks = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/restaurants", label: "Restaurants" },
  { href: "/faq", label: "FAQ" },
] as const;

/**
 * A nav link is active on its own route and on any route nested under it.
 * `usePathname()` never includes the query string, so `/pricing?for=owners`
 * still matches `/pricing`.
 */
function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Shared by the desktop links and the panel links: 8px radius, neutral-400,
// hover to text on a 6% text tint, accent when current.
const navLinkClass =
  "flex items-center rounded-md text-eq-neutral-400 transition-colors duration-150 hover:bg-foreground/6 hover:text-eq-text aria-[current=page]:text-primary";

// 36px header buttons: README says `0 14px` padding, 14px type, 8px radius.
const headerButtonClass = "rounded-md px-3.5 text-sm";

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelId = useId();

  // Close the panel when the route changes (back/forward, in-page links that
  // are not in the panel). Adjusting state during render instead of in an
  // effect avoids a frame with a stale open panel on the new page.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  const close = () => setOpen(false);

  return (
    <header className="sticky top-0 z-50 border-b border-eq-divider bg-[color-mix(in_srgb,var(--eq-bg)_84%,transparent)] backdrop-blur-[14px]">
      <Container className="flex h-16 items-center gap-7">
        <Link href="/" aria-label="EquipQR home" onClick={close} className="flex-none">
          <Logo markClassName="size-[26px] text-eq-accent" wordmarkClassName="text-[19px]" />
        </Link>

        <nav aria-label="Primary" className="ml-auto flex items-center gap-0.5 max-[880px]:hidden">
          {navLinks.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(navLinkClass, "h-9 px-3 text-sm")}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 max-[880px]:hidden">
          <Link
            href="/e"
            className={cn(navLinkClass, "h-9 px-3 text-sm")}
          >
            Have a sticker code?
          </Link>
          <Button
            variant="neutral"
            size="lg"
            className={headerButtonClass}
            render={<Link href="/login" />}
            nativeButton={false}
          >
            Log in
          </Button>
          <Button
            variant="brand"
            size="lg"
            className={headerButtonClass}
            render={<Link href="/signup" />}
            nativeButton={false}
          >
            Start free trial
          </Button>
        </div>

        <Button
          variant="neutral"
          size="icon"
          className="ml-auto size-11 rounded-md min-[881px]:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
        >
          <Icon icon={open ? X : Menu} size={22} className="size-5" />
        </Button>
      </Container>

      <div
        id={panelId}
        hidden={!open}
        className="flex flex-col gap-1 border-t border-eq-divider bg-eq-bg px-[clamp(20px,5vw,72px)] pt-2 pb-5 min-[881px]:hidden"
      >
        {navLinks.map((link) => {
          const active = isActive(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              onClick={close}
              className={cn(navLinkClass, "min-h-11 px-3 text-base")}
            >
              {link.label}
            </Link>
          );
        })}
        <div className="mt-3 flex flex-col gap-2">
          <Link
            href="/e"
            onClick={close}
            className={cn(navLinkClass, "min-h-11 px-3 text-base")}
          >
            Have a sticker code?
          </Link>
          <Button
            variant="neutral"
            size="xl"
            className="w-full"
            render={<Link href="/login" onClick={close} />}
            nativeButton={false}
          >
            Log in
          </Button>
          <Button
            variant="brand"
            size="xl"
            className="w-full"
            render={<Link href="/signup" onClick={close} />}
            nativeButton={false}
          >
            Start free trial
          </Button>
        </div>
      </div>
    </header>
  );
}
