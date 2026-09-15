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

// Every Reveal on a page mounts in the same commit. Deciding "is this below
// the fold?" per component would interleave a layout read (getBoundingClientRect)
// with a style write (data-reveal) twenty times over, forcing a fresh layout for
// each one — about a second of main-thread work on a throttled phone. Instead
// the mounts queue up and one animation frame does all the reads first, then
// all the writes, and a single IntersectionObserver watches the hidden ones.
let pending: HTMLElement[] = [];
let flushScheduled = false;
let observer: IntersectionObserver | null = null;
const observed = new Set<HTMLElement>();

function getObserver(): IntersectionObserver {
  if (!observer) {
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        el.dataset.reveal = "visible";
        observer?.unobserve(el);
        observed.delete(el);
      }
    }, OBSERVER_OPTIONS);
  }
  return observer;
}

function flush() {
  flushScheduled = false;
  const batch = pending;
  pending = [];
  // Read phase: one layout for the whole batch. Anything already in (or near)
  // view on mount stays visible with no animation.
  const limit = window.innerHeight * 0.92;
  const belowFold = batch.filter((el) => el.isConnected && el.getBoundingClientRect().top > limit);
  // Write phase.
  const io = getObserver();
  for (const el of belowFold) {
    el.dataset.reveal = "hidden";
    io.observe(el);
    observed.add(el);
  }
}

function schedule(el: HTMLElement) {
  pending.push(el);
  if (!flushScheduled) {
    flushScheduled = true;
    window.requestAnimationFrame(flush);
  }
}

function release(el: HTMLElement) {
  pending = pending.filter((candidate) => candidate !== el);
  if (observed.has(el)) {
    observer?.unobserve(el);
    observed.delete(el);
  }
  // A remount (e.g. Fast Refresh) starts visible again.
  el.dataset.reveal = "";
}

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

    schedule(el);
    return () => release(el);
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
