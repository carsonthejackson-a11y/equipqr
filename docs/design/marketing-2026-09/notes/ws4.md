# WS4 — Header + footer

Implements README "SiteHeader" / "SiteFooter", `SiteHeader.dc.html`,
`SiteFooter.dc.html` and BRIEF WS4 (+ the two lockup changes WS2 requested).
Files changed: `src/app/(marketing)/_components/site-header.tsx`,
`src/app/(marketing)/_components/site-footer.tsx`. Nothing else.

## Header (`site-header.tsx`, client)

- `sticky top-0 z-50`, `border-b border-eq-divider`,
  `bg-[color-mix(in_srgb,var(--eq-bg)_84%,transparent)] backdrop-blur-[14px]`;
  the row is a `Container` (`flex h-16 items-center gap-7`). Rendered height is
  65px = 64 + the 1px border, same as the design.
- Logo: `<Link href="/" aria-label="EquipQR home">` →
  `<Logo markClassName="size-[26px] text-eq-accent" wordmarkClassName="text-[19px]" />`.
- Nav (`aria-label="Primary"`, `ml-auto`, `gap-0.5`, `max-[880px]:hidden`):
  Features / Pricing / Restaurants / FAQ in that order. Shared `navLinkClass`
  = `rounded-md text-eq-neutral-400 transition-colors duration-150
  hover:bg-foreground/6 hover:text-eq-text aria-[current=page]:text-primary`;
  desktop links add `h-9 px-3 text-sm`, panel links `min-h-11 px-3 text-base`.
- **Active route:** `isActive(pathname, href)` =
  `pathname === href || pathname.startsWith(href + "/")`. `usePathname()`
  strips the query, so `/pricing?for=owners` marks Pricing (verified). The
  match sets `aria-current="page"`, and the accent color keys off that
  attribute, so state and style cannot drift apart.
- Buttons: `Log in` = `variant="neutral" size="lg"`, `Start free trial` =
  `variant="brand" size="lg"`, both `render={<Link/>} nativeButton={false}`
  with `className="rounded-md px-3.5 text-sm"` (36px, 14px padding, 8px radius
  per README "Radius"; `size="lg"` alone is `px-2.5` + 10px radius).
- **Mobile menu:** `useState(open)`; a 44×44 `variant="neutral" size="icon"`
  button (`size-11 rounded-md min-[881px]:hidden`) with
  `aria-expanded={open}`, `aria-label` "Open menu"/"Close menu",
  `aria-controls={useId()}` pointing at the panel, and
  `<Icon icon={open ? X : Menu} size={22} className="size-5" />` (the design
  glyph is 20px; `Icon`'s size union is 16|18|22|24, so the class sets the
  rendered box — the `size-` class also opts out of Button's `svg` sizing rule).
  The panel is always in the DOM with `hidden={!open}` (so `aria-controls`
  always resolves and hidden links are not tabbable) and `min-[881px]:hidden`;
  `border-t border-eq-divider bg-eq-bg px-[clamp(20px,5vw,72px)] pt-2 pb-5`,
  `gap-1` links, then `mt-3 gap-2` stacked `size="xl" className="w-full"`
  neutral + brand buttons (44px / 15px).
- **Closing:** every panel link and the logo call `close()` on click. Route
  changes (back/forward, links outside the panel) are handled with the
  "adjust state during render" pattern (`prevPathname` state; when
  `pathname` differs, reset it and `setOpen(false)`) rather than an effect —
  `react-hooks` 7 flags `setState` in an effect and this avoids the one-frame
  stale-open flash.
- e2e locators: `a[href="/signup"]` / `a[href="/login"]` with the visible text
  exist in both the desktop row and the panel; at the e2e viewport (1280) the
  `.first()` match is the visible desktop button (checked).
- Tab order (checked with Playwright): desktop logo → Features → Pricing →
  Restaurants → FAQ → Log in → Start free trial; mobile logo → menu button
  (→ panel links when open).

## Footer (`site-footer.tsx`, server)

- `border-t border-eq-divider`; `Container` `pt-14 pb-10`.
- Row 1 `flex flex-wrap gap-[40px_56px]`: brand column
  `flex-[1_1_260px] max-w-[340px] flex-col gap-[14px]` with `<Link href="/"
  aria-label="EquipQR home">` → `<Logo markClassName="size-6 text-eq-accent"
  wordmarkClassName="text-lg" />`, the description verbatim
  (`text-sm leading-[1.6] text-eq-neutral-400`), and `mailto:${SUPPORT_EMAIL}`
  (neutral-400 → text on hover). Link columns sit in the design's inner wrapper
  `flex-[2_1_420px] flex-wrap gap-[32px_48px]`, each `flex-[1_1_120px] flex-col
  gap-3` with a 12px uppercase `tracking-[0.08em] text-eq-neutral-500
  font-medium` label and a `gap-3` `<ul>`; links 14px neutral-300 → text,
  `transition-colors duration-150`. Product now includes "For restaurants"
  → `/restaurants` (BRIEF §3.5).
- Row 2: `<hr className="eq-rule mt-9 mb-[22px]" />` (design: 36px below
  row 1, 22px above the text) then a 13px neutral-500 `flex-wrap
  justify-between gap-[8px_24px]` row: `© {year} EquipQR. All rights
  reserved.` and `Built by a working repair technician in Dallas–Fort Worth.`
  (U+2013 en dash, copied from the design file).
- Column label weight is 500 per the WS4 spec (the design's inline label is
  400) — same call WS3 made for kickers.

## Checks

- `npx tsc --noEmit` clean; `npm run lint` clean;
  `npx vitest run src/components` → 3 files / 19 tests pass.
- Screenshots of `/` at 375 / 880 / 881 / 1440 (header crop + footer crop):
  burger at 880, full nav at 881; no horizontal overflow at any width; no
  console or page errors.
- Playwright script (scratchpad `ws4.mjs`): at 375 the button is 44×44,
  `aria-expanded` flips false → true → false, the label toggles, all six panel
  links are visible when open and hidden when closed, clicking "Pricing" in
  the panel navigates and closes it, `aria-current="page"` then sits on both
  Pricing links, reopening and `goBack()` closes it (route-change path), and
  the tab orders above hold.
- `grep font-semibold|font-bold` over both files → 0 hits.

## Not done / for later

- `HANDOFF-NOTES.md` has an empty "## WS4" heading; it is outside this
  workstream's file list, so it was left for the orchestrator.
- The old header closed the panel via `onClick` on every link only; the
  route-change reset is new behaviour (BRIEF asked for it).
