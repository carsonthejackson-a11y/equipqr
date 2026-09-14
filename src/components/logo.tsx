import { createElement, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * EquipQR brand mark — "Scan Q, arrow" (docs/design/marketing-2026-09/BRIEF.md §6,
 * README "Brand"). A QR finder pattern whose fourth corner opens into an arrow.
 *
 * The geometry lives here as data so `src/app/icon.tsx` and
 * `src/app/(marketing)/opengraph-image.tsx` can render exactly the same shapes
 * inside Satori (which needs hex colors and inline <svg>), while `LogoMark`
 * renders it in the DOM with `currentColor`.
 *
 * Brand Board rules: square caps, miter joins, no rotation/stretch, no glow or
 * shadow, no rounded caps, no background tile. Clear space >= 14 units on every
 * side is already built into the 100x100 viewBox (ink spans 14..92).
 */

export const MARK_VIEWBOX = "0 0 100 100";
/** Base stroke width from the spec; the center square uses 7. */
export const MARK_STROKE = 9;

export type MarkShape = {
  tag: "path" | "rect" | "line" | "polygon";
  attrs: Record<string, string | number>;
  /** Stroke width in viewBox units (default `MARK_STROKE`). Ignored when `filled`. */
  strokeWidth?: number;
  /** Solid shape: filled with the mark color, no stroke. */
  filled?: boolean;
};

/** Full mark. Minimum 24px on screen (Brand Board). */
export const MARK_PATHS: readonly MarkShape[] = [
  { tag: "path", attrs: { d: "M14 36V14h22M56 14h22v22M14 56v22h22" } },
  { tag: "rect", attrs: { x: 31, y: 31, width: 30, height: 30 }, strokeWidth: 7 },
  { tag: "rect", attrs: { x: 40, y: 40, width: 12, height: 12 }, filled: true },
  { tag: "line", attrs: { x1: 74, y1: 74, x2: 84, y2: 84 } },
  { tag: "path", attrs: { d: "M72 88h16V72" } },
];

/**
 * Simplified mark for sizes below 24px: the open arrow head becomes a solid
 * triangle so it survives at 16–18px (Brand Board `#eqs`, "16 · solid arrow").
 */
export const MARK_PATHS_SMALL: readonly MarkShape[] = [
  MARK_PATHS[0],
  MARK_PATHS[1],
  MARK_PATHS[2],
  { tag: "line", attrs: { x1: 74, y1: 74, x2: 80, y2: 80 } },
  { tag: "polygon", attrs: { points: "68,92 92,92 92,68" }, filled: true },
];

export type MarkSvgProps = {
  /**
   * Stroke + fill color. Defaults to `currentColor` for the DOM. Satori
   * rasterizes inline SVG on its own, so pass a hex value there.
   */
  color?: string;
  /** Pixel size (sets width/height). Omit in the DOM and size via `className`. */
  size?: number;
  /** Multiplies every stroke width; 1 = brand spec. Used to thicken tiny renders. */
  strokeScale?: number;
  shapes?: readonly MarkShape[];
  className?: string;
  style?: CSSProperties;
  /** Decorative by default; pass a `title` to make it an accessible image. */
  title?: string;
};

/**
 * The raw mark as an inline <svg>. Shared by `LogoMark` (DOM) and the
 * favicon / OG image (Satori). Every attribute is explicit so the same element
 * serializes correctly outside a browser.
 */
export function MarkSvg({
  color = "currentColor",
  size,
  strokeScale = 1,
  shapes = MARK_PATHS,
  className,
  style,
  title,
}: MarkSvgProps) {
  const scaled = (w: number) => Math.round(w * strokeScale * 100) / 100;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={MARK_VIEWBOX}
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={scaled(MARK_STROKE)}
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={className}
      style={style}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {shapes.map((shape, i) =>
        createElement(shape.tag, {
          key: i,
          ...shape.attrs,
          ...(shape.filled
            ? { fill: color, stroke: "none" }
            : { fill: "none", strokeWidth: scaled(shape.strokeWidth ?? MARK_STROKE) }),
        })
      )}
    </svg>
  );
}

/**
 * The mark for the DOM. Takes its color from the parent (`currentColor`) and
 * sets none itself; default size 24px (`size-6`), override via `className`
 * (header 26px, footer 24px, About teaser 40px). Below 24px use `LogoMarkSmall`.
 */
export function LogoMark({ className }: { className?: string }) {
  return <MarkSvg className={cn("size-6 shrink-0", className)} />;
}

/** Solid-arrow variant for sizes under 24px (e.g. an 18px sidebar mock). */
export function LogoMarkSmall({ className }: { className?: string }) {
  return <MarkSvg shapes={MARK_PATHS_SMALL} className={cn("size-4 shrink-0", className)} />;
}

/**
 * Wordmark type: DM Sans 500 on marketing (`--font-dm-sans` is defined on the
 * marketing layout root), falling back to Geist on app pages where that
 * variable does not exist. Never bolder than 500.
 */
export const WORDMARK_CLASS =
  "font-[family-name:var(--font-dm-sans,var(--font-geist-sans))] font-medium tracking-[-0.02em] leading-none";

export type LogoProps = {
  /** Wrapper classes (layout, wordmark color/size inherit from here). */
  className?: string;
  /**
   * Classes for the mark. Defaults to `text-primary` (teal on the light app
   * pages; the marketing theme remaps `--primary` to the accent). Marketing
   * can pass e.g. `text-eq-accent` explicitly; tailwind-merge drops the default.
   */
  markClassName?: string;
  /** Classes for the wordmark span (e.g. `text-[19px]` in the header). */
  wordmarkClassName?: string;
};

/** Mark + "EquipQR" wordmark lockup with the Brand Board's 10px gap. */
export function Logo({ className, markClassName, wordmarkClassName }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className={cn("text-primary", markClassName)} />
      <span className={cn("text-lg", WORDMARK_CLASS, wordmarkClassName)}>EquipQR</span>
    </div>
  );
}
