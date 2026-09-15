# WS8 — Restaurants (`/restaurants`)

Rebuilt `src/app/(marketing)/restaurants/page.tsx` from `Restaurants.dc.html`
(README "Screens → 4. Restaurants") on the WS3 primitives. Server component,
no client code; copy verbatim from the design file.

## Sections, in order

1. **Hero** — `Section variant="hero"` with a two-column auto-fit grid
   (`minmax(min(100%,340px),1fr)`, `gap 48px clamp(32px,5vw,80px)`).
   `SectionHeader size="h1"` (kicker / H1 "Tag the kitchen. …" with
   `id="page-title"` / lead `max-w-[54ch]`), `Start free` (`brand xl`, 46px,
   arrow) → `/signup?kind=owner`, `See how it works` (`neutral xl`) →
   `#how-it-works`, 13.5px small print. Right: `PhoneFrame rotate={2}
   delayMs={120} gap={9}` with the staff report screen (Header → Question →
   Chips[0 selected] → PhotoRow → Urgency → Primary "Send work order").
2. **The moment it's for** — kicker, `h2-story` H2, two 16.5px/1.65 paragraphs
   beside `TimelineCard` (Dish machine · Back kitchen / `Sent` / 7:40, 7:41,
   7:41 / dashed note). Stat band behind `const showStat = true`: 49% at
   `clamp(44px,5vw,64px)` / -0.035em / accent, neutral-200 sentence, 12.5px
   source line.
3. **How it works** — `Section id="how-it-works"` (`scroll-mt-20` from
   `Section`), header + side note in an `items-end` grid, four `StepCard`s in
   `minmax(min(100%,260px),1fr)`.
4. **What staff see** — 24px `Scan` icon + H2 (`h2-sub` overridden to
   `clamp(26px,3vw,36px)` per the design), two paragraphs; right: report phone
   (`rotate={-3}`, `translate-y-[18px]`, "Frost build-up" selected, "1 photo
   added", "Whenever they're next nearby") and the confirmation phone
   (`rotate={3}`, `max-[1100px]:hidden`: CheckCircle → Title → Note → Card
   "Work order #1043" → Primary with `Phone` icon).
5. **What you see** — owner `DashboardCard` first in the grid (`order-first`,
   `max-[800px]:order-2`, see below): `DashboardHeader` + outline `Tag`, two
   `DashboardLocationRow`s ("1 open" in accent), `DashboardSectionLabel` +
   `DashboardVendorGrid` (Metro Refrigeration / dashed "Cooking · no vendor
   yet"), `DashboardProgress` (five steps, three done, `Acknowledged`). Right:
   kicker "For the owner", H2, intro, four `IconRow`s (MapPin, Truck,
   MessageSquare, ShieldCheck).
6. **Plans** teaser behind `const showPricingTeaser = true` — `SectionHeader`
   + `GhostLink` → `/pricing?for=owners`, three `PlanCard compact
   interval="month"` from `ownerPlans` (highlight = `plan.popular`, names and
   limits come from `plans.ts`), 13px footnote.
7. **Questions** — kicker, H2, "Billing questions are on the pricing page."
   (link → `/pricing?for=owners`, `text-eq-accent-300` underline), `FaqList
   items={ownerFaqs}`.
8. **CTA** — `Section variant="cta"` + `CtaPanel` ("Put a tag on your first
   machine today.", `Start free` → `/signup?kind=owner`, `Talk to us first` →
   `/contact`).

`Reveal` wraps the hero copy, each section's header/grid block (the design
wraps whole two-column blocks in one `data-reveal`), the step grid, the plan
grid and the CTA. Every section has `aria-labelledby` and a `rule` divider
except the hero.

## Decisions

- **Plan names are never hard-coded.** The compact cards render `plan.name`;
  the owner mock's `Multi-kitchen` tag also reads
  `ownerPlans.find(p => p.id === "multi_site").name`, so it follows WS7's D4
  rename automatically (it reads "Multi-site" only if D4 hasn't landed).
- **`metadata`**: title updated to "For Restaurants & Kitchens" (matches the new
  kicker; the old "& Small Business" wording is gone from the design) and the
  description is the new hero lead verbatim.
- **Owner mock reorder point is 800px, not 760px.** The two-column auto-fit
  grid with 340px columns and `clamp(32px,5vw,80px)` gutters stacks below a
  ~800px viewport. The design's `@media (max-width: 760px)` would leave the
  mock *above* the copy between 761 and 799px, so the page uses
  `max-[800px]:order-2` (the mock still sits under the copy at ≤760 as the QA
  checklist requires).
- Hero CTAs use `size="xl"` plus `h-[46px] px-5` to match the design's 46px
  hero buttons (same as `CtaPanel`).
- The `See how it works` button is a `Link` to `#how-it-works`; smooth scroll
  comes from WS1's `html:has(.theme-nocturne)` rule.
- `Scan` (Lucide) stands in for the design's `i-scan` glyph; `MessageSquare`
  for `i-chat`, `ShieldCheck` for `i-badge`.

## Requests (files I don't own)

- `phone-mock.tsx` — the Restaurants staff phones use `padding-top: 46px` and
  `padding-bottom: 16px` in the design (`PhoneFrame` is fixed at 42/16). A
  `padTop?: 42 | 46` prop would close the 4px gap; not visible enough to
  matter, left as is.
- `feature-row.tsx` — `visualLeft` uses `max-[760px]:order-2`, which in
  Tailwind v4 is `width < 760px` (exclusive) while the grid it sits in stacks
  at ~800px; same off-by-one as above. Consider `max-[800px]` (or matching
  whatever column min-width the row uses). Not used on this page for that
  reason.
- Tailwind `max-[N]` is exclusive; README's "≤ 1100px" for the second phone
  therefore shows both phones at exactly 1100px. Harmless (the phones
  overflow their column by ~15px, centered, no page overflow) and the brief
  names `max-[1100px]:hidden` explicitly, so kept.
- `owner-pricing-cards.tsx` is no longer imported by this page; WS7 can
  delete it if Pricing stops using it too.

## Verification

- `npx tsc --noEmit`: no errors in files I own (the only errors at the time
  were in `privacy/page.tsx` / `terms/page.tsx`, mid-edit by another
  workstream). `npx eslint src/app/(marketing)/restaurants/page.tsx` clean.
- `grep -n "font-semibold\|font-bold"` on the page → 0 hits.
- Screenshots at 380 / 760 / 780 / 1100 / 1440 in
  `scratchpad/shots/ws8/`: no console errors, no page errors, no horizontal
  overflow (`scrollWidth === clientWidth`) at any width. Second phone hidden
  below 1100; owner mock under the copy when stacked; step cards 4 → 2+2 → 1;
  vendor grid single-column at 380; plan cards 3 → 1.
- e2e `/restaurants` H1 still starts with "Tag the kitchen".
