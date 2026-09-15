"use client";

import { useEffect, useRef, type CSSProperties, type ElementType, type ReactNode } from "react";

// Scroll reveal (docs/design/marketing-2026-09/BRIEF.md D6). The server (and
// the first client paint) always renders children fully visible: this only
// ever adds `data-reveal="hidden"` inside an effect, and only to elements that
// start below 92% of the viewport, so nothing above the fold ever flashes.
// The CSS lives in globals.css under `@media (prefers-reduced-motion:
// no-preference)`. Wrap section headers and card grids only, never single
// list items.

export type RevealProps = {
  children?: ReactNode;
  /** Transition delay, e.g. 120 for the hero phone. */
  delayMs?: number;
  /** `false` disables the effect entirely (the README's `scrollReveal` flag). */
  enabled?: boolean;
  className?: string;
  style?: CSSProperties;
  as?: "div" | "section" | "article" | "figure" | "li" | "span" | "header";
  id?: string;
};

const OBSERVER_OPTIONS: IntersectionObserverInit = {
  threshold: 0.12,
  rootMargin: "0px 0px -6% 0px",
};

export function Reveal({
  children,
  delayMs,
  enabled = true,
  className,
  style,
  as = "div",
  id,
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    if (typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Already in (or near) view on mount: leave it visible, no animation.
    if (el.getBoundingClientRect().top <= window.innerHeight * 0.92) return;

    el.dataset.reveal = "hidden";
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      el.dataset.reveal = "visible";
      observer.disconnect();
    }, OBSERVER_OPTIONS);
    observer.observe(el);

    return () => {
      observer.disconnect();
      // A remount (e.g. Fast Refresh) starts visible again.
      el.dataset.reveal = "";
    };
  }, [enabled]);

  const mergedStyle: CSSProperties | undefined =
    delayMs !== undefined
      ? ({ ...style, "--reveal-delay": `${delayMs}ms` } as CSSProperties)
      : style;

  // The tag is one of a few intrinsic elements; widening to ElementType keeps
  // a single HTMLElement ref type across the union.
  const Tag = as as ElementType;
  return (
    <Tag ref={ref} id={id} className={className} style={mergedStyle} data-reveal="">
      {children}
    </Tag>
  );
}
