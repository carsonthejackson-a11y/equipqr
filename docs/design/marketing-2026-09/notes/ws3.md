# WS3 — Shared marketing primitives

All components live in `src/app/(marketing)/_components/` unless noted. Server
components by default; only `reveal.tsx` and `segmented.tsx` are `"use client"`
(`compare-table.tsx` imports `ui/table.tsx`, which is itself a client file).
Everything is styled with the `eq-*` tokens from WS1; headings and labels are
`font-medium` (500), never bolder; accent-coloured copy uses `text-eq-accent-300`.

## Button (`src/components/ui/button.tsx`, additive)

- `variant="brand"` — accent outline, transparent fill, tint-12 hover, tint-16 + accent-400 pressed. Primary marketing CTA.
- `variant="neutral"` — neutral-700 outline, foreground text, `hover:bg-foreground/10`. Secondary CTA.
- `size="xl"` — 44px (`h-11 px-4 text-[15px] gap-2 rounded-md`). CTA-panel / contact submit pass `className="h-[46px] px-5"`. Header buttons keep `size="lg"`.
- Links: `render={<Link href="/signup" />}` (nativeButton is inferred). Never `variant="default"` on a marketing page.
- Trailing arrow: `<Icon icon={ArrowRight} size={16} data-icon="inline-end" />` as the last child.

## API reference

### `icon.tsx`
- `Icon({ icon: LucideIcon, size?: 16|18|22|24, check?, className, ...svgProps })` — Lucide glyph with `strokeWidth 1.75` (2 when `check`), square caps, miter joins, `aria-hidden` unless `aria-label`/`aria-labelledby` is given (then `role="img"`).
- `CheckIcon(props)`, `XIcon(props)` — check/x marks. In tables pass `aria-label="Included"` / `"Not included"`.

### `container.tsx`
- `Container({ as?, className, ...divProps })` — `mx-auto w-full max-w-[1200px] px-[clamp(20px,5vw,72px)]`. `containerClass` string also exported.

### `section.tsx`
- `Section({ id?, variant?: "hero"|"default"|"cta", rule?, bleed?, containerClassName?, className, "aria-labelledby"|"aria-label", children })` — `<section>` with the README rhythm (hero top `clamp(56px,7vw,104px)`; default top `clamp(40px,5vw,72px)` / bottom `clamp(24px,3vw,48px)`; cta bottom `clamp(72px,9vw,128px)`), wrapping a `Container`. `id` adds `scroll-mt-20`; pages with a JumpNav pass `className="scroll-mt-[124px]"`. `rule` renders the faded `.eq-rule` at the top with `mb-[clamp(40px,5vw,72px)]`. `bleed` skips the Container.

### `kicker.tsx`
- `Kicker({ children, className })` — 13px uppercase 0.06em accent, weight 500.
- `SectionHeader({ kicker?, title, titleId?, lead?, size?: "h1"|"h1-hero"|"h2"|"h2-outcome"|"h2-sub"|"h2-story"|"h3"|"h3-row", as?, align?, className?, titleClassName?, leadClassName?, children? })` — kicker + heading + paragraph in a `max-w-[640px]` block. Heading tag is `h1` for the h1 sizes, `h2` otherwise (override with `as`). `lead` uses the README lead style for h1 sizes and the 16px neutral-400 intro style for h2 sizes. `children` render in a `mt-5` block (links, buttons).
- Exported class strings: `headingClass[size]`, `leadClass`, `introClass`, `kickerClass` for bespoke headings.

### `reveal.tsx` (client)
- `Reveal({ children, delayMs?, enabled?=true, className?, style?, as?, id? })` — BRIEF D6. SSR = visible wrapper with `data-reveal=""`; in an effect it bails under reduced motion / `enabled=false`, sets `data-reveal="hidden"` only when the element's top is below 92% of the viewport, then observes (`threshold 0.12`, `rootMargin 0 0 -6% 0`) and sets visible once. `delayMs` → inline `--reveal-delay`. Wrap section headers and card grids only. Test: `reveal.test.tsx`.

### `tag.tsx`
- `Tag({ variant?: "accent"|"outline"|"neutral", size?: "sm"|"xs", children })` — 999px pill, `w-fit`. accent = tint-12 / accent-200 (Most popular, Sent, Acknowledged, New); outline = neutral-700 border / neutral-300 (plan availability, `Multi-kitchen` in the owner mock); neutral = neutral-800 fill / neutral-100 (dashboard mock rows). `size="xs"` is the `2 months free` badge inside the billing toggle.

### `panel.tsx`
- `Panel({ as?, padding?: "card"|"row"|"none", highlighted?, hover?=true, className, children })` — default card (`rounded-xl border-eq-neutral-900 bg-eq-surface`, hover border neutral-700). `padding="card"` = `clamp(22px,3vw,28px)`, `"row"` = `clamp(20px,3vw,26px)`. `highlighted` = accent border + 4px tint-9 ring over shadow-md + accent-900 glow (`panelHighlightClass` exported).

### `step-card.tsx`
- `StepCard({ number: "01", title, children, className })` — Panel with accent 13px tabular number, 19px H3, 15px/1.6 neutral-400 copy. Use in `grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-4`.
- Note: Home's "How it works" rows in `Home.dc.html` are *not* these cards (they are 48px-number rows with a mock beside each step, H3 `clamp(22px,2vw,26px)`); WS5 should compose those from `FeatureRow`/plain markup. StepCard matches the Restaurants "Four steps" cards.

### `feature-list.tsx`
- `FeatureList({ items: string[], className, ...ulProps })` — check-list rows, `gap-[10px]`, 16px accent check `mt-[3px]`, 15px neutral-300. Text size lives on the `ul`, so `className="text-[14.5px]"` restyles every row; `flex-1` to push a CTA down.

### `icon-row.tsx`
- `IconRow({ icon, title, children?, size?=22, titleAs?: "h3"|"h4"|"div", className })` — 22px accent icon leader, 16px/1.4 title, 14.5px/1.55 neutral-400 copy. `titleAs="div"` for grids where the row isn't a real sub-heading (Home capability grid).

### `ghost-link.tsx`
- `GhostLink({ href, children, className, ...linkProps })` — "All features →": Button `variant="ghost"` rendered as `Link`, accent text, 42px tall, trailing 16px arrow, no border, tint hover.

### `jump-nav.tsx`
- `JumpNav({ label?="Jump to", items: { href, label, number? }[], ariaLabel?, aside?: { href, label }, className })` — sticky `top-16 z-40` blurred bar with divider borders; label hidden ≤720px; 34px pills (number in accent tabular); wraps ≥720px, scrolls horizontally below. `aside` is the right-aligned text link ("What's on which plan →", hidden ≤1040px). Target sections need `scroll-mt-[124px]`. `jumpNavPillClass` exported.

### `cta-panel.tsx`
- `CtaPanel({ title, titleId?, children (copy), primary: { href, label }, secondary?: { href, label }, note?, icon?, className })` — the README final CTA box (20px radius, accent-900 glow, two-column auto-fit 360px). Primary = `brand` 46px with arrow, secondary = `neutral`. Render inside `<Section variant="cta" aria-labelledby={titleId}>` (usually in a `Reveal`).

### `faq-item.tsx`
- `FaqItem({ question, answer, open?, className })` — native details/summary per README "Accordion" (neutral-800 rules, last row bottom border, 16px/500 summary, accent-300 hover, 18px chevron rotating 180°, 15px neutral-400 answer ≤60ch).
- `FaqList({ items, openFirst?, className })`.
- `type FaqEntry` unchanged (`faq-data.ts` imports it).

### `segmented.tsx` (client)
- `SegmentedControl<T>({ options: { value, label, badge? }[], value, onChange, ariaLabel, name, className })` — real radio inputs inside labels (`role="radiogroup"`). Container `inline-flex bg-eq-surface rounded-[10px]`, 40px options, checked = accent inset outline + accent text.
- `segmentedListClass`, `segmentedOptionClass(checked)` — apply to Base UI `Tabs.List` / `Tabs.Tab` (WS7 audience tabs) for an identical look; the option class includes both `focus-visible:` and `has-[input:focus-visible]:` rings.

### `plan-card.tsx`
- `PlanCard({ plan, interval, highlighted?=plan.popular, ctaHref?, ctaLabel?="Start free trial", ctaVariant?, compact?, limits?, className })` — README §3 card: `<h3>` = plan name only; price numeral is one text node (`$79`, `$1,990`) + `/mo`|`/yr` span (Free: `$0`, no unit); sub-line "Billed monthly, cancel anytime" / "Works out to $N/mo, billed annually" / Free's line; `FeatureList` of highlights with `flex-1`; CTA `size="xl" className="w-full"` as a Link (`nativeButton={false}`), `brand` when highlighted else `neutral`. Highlights containing "Pre-printed" are dropped when `!FEATURES.batchQr`.
- `compact` = Restaurants teaser (name + `Most popular` + 22px price on one line, blurb, limits line; no list/CTA). `limits` overrides the auto line.
- Helpers: `formatPrice(n)` → `$1,990`; `planHighlights(plan)`; `planLimitsLine(plan)`.

### `compare-table.tsx`
- `CompareTable({ plans, rows, firstHeader, interval, highlightedPlanId?, className })` — README "Table": `rounded-xl border overflow-x-auto` wrapper, `min-w-[640px]` table on `ui/table.tsx`; first header 12px/400 neutral-500 (`"Monthly, billed monthly"` / `"Yearly, billed annually"`), plan columns centred with 14px name (accent for the highlighted plan, default = `popular`) and 12px `$79/mo` / `$790/yr` sub-label from `interval`; body first column `px-5 py-3 font-medium`, values neutral-300 tabular; boolean values → 18px check `aria-label="Included"` / neutral-700 X `aria-label="Not included"`.
- `type CompareRow = { label: string; value: (plan: Plan) => ReactNode | boolean }`.
- `providerCompareRows`, `ownerCompareRows` — README §3 rows verbatim, derived from `plans.ts` (`toLocaleString` units, `Unlimited` for null, support label without the trailing " support"). The "Pre-printed batch QR sticker orders" row is included only when `FEATURES.batchQr`.

### `feature-row.tsx`
- `FeatureRow({ id?, title, children (one or more <p>), availability?, icon?, visual, visualLeft?, titleAs?, titleClassName?, className })` — two-column `auto-fit minmax(min(100%,300px),1fr)` row, copy left / mock right; `visualLeft` puts the mock first on desktop (`order-first`) and under the copy ≤760px (`max-[760px]:order-2`). `availability` renders as an outline Tag beside the 16px H3. `id` adds `scroll-mt-[124px]`. The visual column is `aria-hidden`.

### `phone-mock.tsx` (rebuilt)
- `PhoneFrame({ rotate?: number, delayMs?, gap?: 9|10, className, children })` — README "Phone mock" (236px bezel, 38px radius, `bg-eq-bezel`, shadow-md; 452px screen, 30px radius, `pt-[42px] px-[14px] pb-4`, inset neutral-900 ring, dynamic island). `rotate` uses the CSS `rotate` property so `className="translate-y-[22px]"` composes. `delayMs` wraps the frame in a `Reveal`.
- Screen blocks (compose in order, all 10.5–15px): `PhoneHeader({ kicker, title, subtitle? })`, `PhonePrompt`, `PhoneQuestion`, `PhoneOptions({ items, selectedIndex? })` (stacked answers, Home), `PhoneChips({ items, selectedIndex? })` (999px symptom chips, Restaurants), `PhonePhotoRow({ label })`, `PhonePhotoGrid({ count?=3 })`, `PhoneCard({ title, children })`, `PhoneUrgency({ label, question? })`, `PhoneInputRow({ placeholder })` (mt-auto), `PhonePrimary({ label, icon? })` (mt-auto), `PhoneCheckCircle()`, `PhoneTitle`, `PhoneNote`.
- Recipes: Home hero = Header → Prompt → Options(selected 1) → InputRow. Home confirmation = CheckCircle → Title "Request sent" → Note → Card "Already tried" → PhotoGrid → Primary. Restaurants report = Header → Question → Chips(selected) → PhotoRow → Urgency → Primary "Send work order". Restaurants confirmation = CheckCircle → Title → Note → Card "Work order #1043" → Primary(icon=Phone).
- `@deprecated` `ScanScreen`, `GuideScreen`, `RequestScreen` — thin shims composed from the blocks so the old `page.tsx` / `features/page.tsx` still compile. WS5/WS6 must stop importing them; delete afterwards.

### `dashboard-mock.tsx`
- Home frame: `DashboardFrame({ url?="app.equipqr.co/dashboard/requests", sidebar?, children, className })` (browser chrome on bezel, `208px | 1fr` grid, sidebar hidden ≤820px), `DashboardSidebar({ items: { label, count?, countAccent?, active? }[], footer })` (uses `LogoMarkSmall` 18px), `DashboardToolbar({ title, chips: { label, active? }[] })`, `DashboardStats` + `DashboardStat({ label, value })`, `DashboardTable({ columns: [5 labels], children })` + `DashboardRow({ title, subtitle, reported, urgency, status, age })` (Reported/Urgency columns hide ≤700px; `status` takes a `<Tag>`).
- Restaurants owner card: `DashboardCard({ children })`, `DashboardHeader({ title, meta, tag })`, `DashboardLocationRow({ name, meta })`, `DashboardSectionLabel`, `DashboardVendorGrid` (two-up, 1 col ≤560px) + `DashboardVendorCard({ title, children, empty? })` (dashed when `empty`), `DashboardProgress({ title?, tag?, steps: { label, time, done? }[] })` (dots + lines, done steps in accent).
- All static and `aria-hidden`; 12–13px type.

### `timeline-card.tsx`
- `TimelineCard({ title, subtitle?, tag?, rows: { time, title, detail? }[], note?, className })` — the "7:40 pm on a Friday" card: header + accent Tag, `56px 12px 1fr` rows with dot/line connectors (first dot neutral-500, rest accent), dashed mail-icon footer note.

### `tag-mock.tsx`
- `TagMock({ variant?: "default"|"branded", company, phone?, unit?, className })` — 176px sticker. `default` = accent tile with the mark + "Scan for help with this machine"; `branded` = neutral-100 tile with the dashed empty "Your logo" slot (D7) + "Problem? Scan me first." / "Service by {company} · {phone}".
- `TagStripMock({ variant?, company, phone?, unit?, className })` — 176×88 strip label (QR left + copy for default, logo slot + QR right for branded).
- `FakeQr({ size?, className })` — the fixed 29×29 pattern from the design, `currentColor`.

## Smoke page

`src/app/(marketing)/_dev/primitives/page.tsx` (+ `segmented-demo.tsx`) renders every primitive. It is git-excluded, but note that `_dev` is a Next **private folder** and is not routable. To view it: `cp -r "src/app/(marketing)/_dev" "src/app/(marketing)/%5Fdev"` then open `/_dev/primitives`, and delete the copy afterwards (do not commit either). Checked at 380 / 760 / 1100 / 1440: no console errors, no horizontal overflow; reveal verified in Chromium with and without reduced motion.

## Verification

- `npx tsc --noEmit` clean; `npm run lint` clean; `npx vitest run src/components/ui/button.test.tsx "src/app/(marketing)/_components"` → 9 tests green (button + reveal).
- `grep -rn "font-semibold\|font-bold"` over `_components`, `_dev` and `button.tsx` → 0 hits.

## Notes / divergences

- Design vs task spec: the DS `.tag` is 6px-radius with an accent-800 fill; the primitives follow the WS3 spec (999px, tint-12 fill, accent-200 text). Kicker weight is 500 per spec (the design's inline kicker is 400).
- `Section` hero bottom padding is `clamp(40px,5vw,72px)` (Home hero); cta top is `clamp(32px,4vw,64px)` (design CTA sections).
- `FeatureRow` H3 is 16px per README; Features' outcome rows use `clamp(22px,2vw,26px)` in the design — pass `titleClassName` there.
- `IntersectionObserver` rootMargin is written as `"0px 0px -6% 0px"` (unitless values are rejected by browsers).
- Plan names on the smoke page still read "Site"/"Multi-site" until WS7 applies D4.
- Nothing outside the ownership list was edited; `.git/info/exclude` already covered `_dev/`.
