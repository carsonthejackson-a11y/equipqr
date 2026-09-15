# WS2 — Brand: mark, favicon, OG image

Implements BRIEF D3 + WS2. Files owned and changed:

- `src/components/logo.tsx` — rewritten (API kept)
- `src/app/icon.tsx` — rewritten (32×32 PNG)
- `src/app/(marketing)/opengraph-image.tsx` — rewritten (1200×630 PNG)
- `public/brand/equipqr-mark.svg` — new (handoff asset, `xmlns:c2pa` dropped)

## `logo.tsx` exports

| Export | What |
| --- | --- |
| `MARK_VIEWBOX`, `MARK_STROKE` | `"0 0 100 100"`, `9` |
| `MarkShape` (type), `MARK_PATHS` | The §6 geometry as data: `{ tag, attrs, strokeWidth?, filled? }[]` |
| `MARK_PATHS_SMALL` | Brand Board `#eqs` solid-arrow variant (line 74,74→80,80 + polygon 68,92 92,92 92,68) |
| `MarkSvg({ color, size, strokeScale, shapes, className, style, title })` | Raw inline `<svg>`; `color` defaults to `currentColor`, pass a hex inside Satori |
| `LogoMark({ className })` | `MarkSvg` with `size-6 shrink-0`, `aria-hidden`, no color of its own |
| `LogoMarkSmall({ className })` | `MARK_PATHS_SMALL`, default `size-4`, for < 24px |
| `WORDMARK_CLASS` | `font-[family-name:var(--font-dm-sans,var(--font-geist-sans))] font-medium tracking-[-0.02em] leading-none` |
| `Logo({ className, markClassName, wordmarkClassName })` | mark (`text-primary` default) + `EquipQR` (`text-lg`), `gap-2.5` (10px) |

- The wordmark class compiles (checked through Tailwind v4's `compile`) to `font-family: var(--font-dm-sans,var(--font-geist-sans))`; on app pages `--font-dm-sans` is undefined so Geist is used. Never above weight 500.
- `Logo`'s mark defaults to `text-primary`. Under `.theme-nocturne` (WS1) `--primary` is already `#3ecf8e`, so marketing gets the accent even with no override; to be explicit, pass `markClassName="text-eq-accent"` — tailwind-merge drops the default `text-primary`. A `text-*` color on the wrapper `className` does **not** reach the mark (the mark's own class wins), which is why `markClassName` exists.

## Favicon (`icon.tsx`)

Mark only, `#3ecf8e` on `#161826`, `border-radius: 7`, svg drawn at the full 32px (the viewBox's built-in 14-unit clear space becomes the padding). Strokes are scaled by `11/9` (brackets/arrow 11, center square 8.6 units). I rendered 9/7, 10/7.8, 11/8.6 through `ImageResponse` and compared them at 16/32/64/160px: 11/8.6 is the heaviest setting that still keeps the gap between the brackets and the center square open, and it is the only one that stays legible when the browser downsamples to 16px. Spec strokes (9/7) smudge at 16px.

## OG image (`opengraph-image.tsx`)

- Exports kept: `size`, `contentType`; `alt` is now `"EquipQR — Scan the tag. Fix it, or file the request."`.
- Ground `#161826` + `radial-gradient(1000px 600px at 82% -140px, rgba(9,52,33,0.72), transparent 60%)` (README page-root glow, accent-900 at 72%, scaled to 1200×630) + the README's bottom-left `rgba(0,0,0,.3)` layer. Satori 0.25 (bundled in Next 16.2.12) parses explicit ellipse sizes and negative `at` offsets; verified by rendering.
- Lockup: `MarkSvg` 84px `#3ecf8e` + `EquipQR` 50px/500/-0.02em `#e9e9ed`, gap 28. Headline 60px/500/1.1 `#e9e9ed` forced onto two lines like the Home H1. Sub-line `SITE_DESCRIPTION` 28px/400/1.4 `#b2b6ca`, max-width 860.
- **Fonts:** DM Sans 500 (wordmark), Inter 500 (headline), Inter 400 (sub-line) are fetched at build time from Google Fonts: the `css2` stylesheet is requested without a browser UA (Google then serves `format('truetype')` URLs), the `.ttf` URL is extracted and fetched as an `ArrayBuffer`, and the three are passed as `fonts: [{ name, data, weight, style }]`. Each load is wrapped in `try/catch` with `AbortSignal.timeout(8000)`; any failure returns `null`, the family name is dropped from the JSX (`fontFamily: undefined`) and Satori uses its bundled fallback (Geist Regular in this Next build), so an offline build still succeeds. Verified end-to-end here: 3 CSS + 3 TTF fetches (27KB DM Sans, ~160KB each Inter), 298ms render. Chosen over committing TTFs because the repo has no font assets and the 500KB `ImageResponse` bundle limit counts bundled files but not runtime-fetched data.
- `next.config.ts` has no `cacheComponents`, so the plain `fetch` keeps the route statically generated.
- Verification was done by invoking both default exports through `next/og` in a scratch vitest run (outside the repo) and inspecting the PNGs; `next build` was intentionally not run.

## Call-site review (grep `@/components/logo`) — requested changes

No call site relied on the old 32px filled tile for layout: every `Logo` use is a centered flex lockup inside a `space-y-*` / `gap-4` stack, and `dashboard/layout.tsx` already overrides the mark to `size-7`. Lockup height drops from 32px to 24px, which only tightens those stacks slightly. Nothing needs editing to keep layout, but three sites need a class for **color/brand correctness**:

1. `src/app/dashboard/layout.tsx` (lines ~149 and ~162): `<LogoMark className="size-7" />` → `<LogoMark className="size-7 text-primary" />` (×2). `LogoMark` no longer carries a color; without this the mark inherits the foreground gray instead of teal (D3: "Mark should be teal (`text-primary`) there").
2. `src/app/(marketing)/_components/site-footer.tsx` (line ~40–41, WS4 owns): replace `<LogoMark />` + `<span className="font-heading text-lg font-semibold leading-none">EquipQR</span>` with `<Logo markClassName="text-eq-accent" />` (or keep `LogoMark` with `className="text-eq-accent"` and use `WORDMARK_CLASS` on the span). The current span is weight 600, which the Brand Board forbids.
3. `src/app/(marketing)/_components/site-header.tsx` (line ~26, WS4 owns): `<Logo />` → `<Logo markClassName="size-[26px] text-eq-accent" wordmarkClassName="text-[19px]" />` per README "SiteHeader" (26px mark, 19px wordmark, 10px gap — the gap is already the `Logo` default).

Optional: `src/app/dashboard/locations/[id]/poster/page.tsx` prints the lockup; Brand Board says mono for print, so `<Logo className="justify-center" markClassName="print:text-foreground" />` would print the mark in black. Not required.

Unchanged and fine as-is: `(auth)/layout.tsx`, `invite/[token]/page.tsx`, `not-found.tsx`, `error.tsx`, `admin/layout.tsx`, `dashboard/onboarding/owner/page.tsx`.

## Checks

- `npx tsc --noEmit` — pass
- `npm run lint` (full) — pass
- `npx vitest run src/components` — 3 files / 19 tests pass
