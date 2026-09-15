# WS7 — Pricing (`/pricing`) + plan rename (D4)

## Files

- `src/lib/plans.ts` — D4: `site.name` → "Kitchen", `site.blurb` → "For one kitchen that wants AI troubleshooting and pre-printed QR batches.", `multi_site.name` → "Multi-kitchen", `multi_site.blurb` → "For an owner running several kitchens who wants branding across all of them.", `multi_site.highlights[3]` → "Everything in Kitchen". Ids, prices, limits, features, Stripe env vars unchanged; a comment above `ownerPlans` records the rename. `npx vitest run src/lib/plans.test.ts` → 16 green.
- `src/app/(marketing)/_components/faq-data.ts` — only "Site and Multi-site add more equipment" → "Kitchen and Multi-kitchen add more equipment" in `ownerFaqs`. Nothing reordered.
- `src/app/(marketing)/pricing/page.tsx` — server page: hero + `<Suspense fallback={<PricingBody audience="providers" />}><AudienceTabs /></Suspense>`. `metadata.description` is the new hero lead (with `TRIAL_DAYS` interpolated).
- `src/app/(marketing)/pricing/audience-tabs.tsx` — client: `PricingBody` (controls row, plan cards, compare, questions, CTA; owns the `interval` state) and `AudienceTabs` (reads/writes `?for=owners` with `useSearchParams` + `router.replace(..., { scroll: false })`).
- Deleted: `pricing/pricing-toggle.tsx`, `_components/pricing-cards.tsx`, `_components/owner-pricing-cards.tsx` — replaced by `PlanCard`; verified with grep that nothing imports them any more (Home and Restaurants have already moved to the WS3 primitives).

## Sections (design order)

1. Hero — `Section variant="hero"` (bottom padding overridden to the design's `clamp(24px,3vw,40px)`), `Reveal` → `SectionHeader size="h1"` kicker "Pricing", H1, lead (`max-w-[760px]` block, `max-w-[56ch]` lead).
2. Plans (`#plans`, `aria-label="Plans"`, top padding `clamp(16px,2vw,24px)`) — controls row `flex-wrap justify-between gap-x-6 gap-y-[14px]` in a `Reveal`: Base UI `Tabs.List`/`Tabs.Tab` (raw `@base-ui/react/tabs` primitives, styled with `segmentedListClass` / `segmentedOptionClass(selected)`) + `SegmentedControl` Monthly / Yearly with `<Tag size="xs">2 months free</Tag>`. Cards: `Tabs.Panel` per audience, `PlanCard` ×3 in `grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] items-stretch gap-4`, then the 13px neutral-500 footnote (two verbatim variants; the "14" is `TRIAL_DAYS`).
3. Compare (`#compare`, rule) — kicker "Compare", H2 "Every limit and feature, side by side.", `CompareTable` with `providerCompareRows` / `ownerCompareRows`, `firstHeader` "Monthly, billed monthly" / "Yearly, billed annually", `highlightedPlanId` pro / site, shared `interval`.
4. Questions (`#questions`, rule) — two-column auto-fit 300px grid, gap `32px clamp(32px,5vw,80px)`; left `SectionHeader` (max-w 400px) kicker "Questions", H2 "Billing questions." / "Questions from restaurants and kitchens.", lead "More about the product itself on the [FAQ page](/faq)."; right `FaqList` with `billingFaqs` / `ownerFaqs`.
5. CTA — `Section variant="cta"` + `CtaPanel`: providers "Start on the trial. Pick the plan after." (Start free trial → `/signup`, Talk to us → `/contact`); owners "Start on Free. It doesn't expire." (Get started free → `/signup?kind=owner`, How it works for kitchens → `/restaurants`).

## Decisions

- The shadcn `Tabs*` wrappers were bypassed for the audience list in favour of the raw Base UI primitives: the wrapper's `h-8`, `data-active:bg-background` / `shadow-sm` and `after:` indicator classes would have fought the segmented look. Same Base UI component, same URL-state behaviour, `aria-selected` / tabpanel semantics intact.
- `Tabs.Root` wraps only the plans `Section` (list + panels). Compare, questions and the CTA render conditionally from the same `audience` below it, so `Section` containers are not nested inside a tabpanel.
- Interval state lives in `PricingBody`, which stays mounted across audience switches, so a Yearly selection survives switching tabs (cards, sub-lines and table header stay in sync).
- Plan CTAs: `/signup?plan=<id>` and `/signup?kind=owner&plan=<id>`; Free reads "Get started free", every other card "Start free trial"; Pro / Kitchen are `brand` via `plan.popular`, the rest `neutral`.
- The FAQ-page link in the Questions lead uses `text-primary` + underline (design: accent, 3px underline offset) with an accent-300 hover; it is a link, not body copy.
- Footnote copy keeps `{TRIAL_DAYS}` interpolated like the hero lead (renders "14-day", identical to the design).

## Verification

- `npx tsc --noEmit`: no errors in WS7 files (the only error in the tree is `contact/contact-form.tsx`, WS11). `npx eslint src/app/(marketing)/pricing src/lib/plans.ts src/app/(marketing)/_components/faq-data.ts` clean. `grep font-semibold|font-bold` over the WS7 files → 0 hits.
- Screenshots at 380 / 760 / 1100 / 1440 for `/pricing` and `/pricing?for=owners` (`scratchpad/shots/ws7/`): no horizontal overflow at 380, cards stack 1 → 2+1 → 3, table scrolls inside its own wrapper, zero console errors from this route (the dev overlay logs WS11's broken `contact-form.tsx` import on every page; not ours).
- Playwright interaction check (`shots/ws7/interact.mjs`): plan names are the only `<h3>`s; `$79` is one text node; Yearly → `$790`, "Works out to $66/mo, billed annually", table header "Yearly, billed annually"; clicking "For restaurants & kitchens" → URL `?for=owners`, headings Free / Kitchen / Multi-kitchen, `scrollY` stays 0, tablist bounding box identical before and after both switches (no layout shift); switching back clears the param and restores the provider hrefs.

## Requests

- None for other files. (`PlanCard`'s yearly sub-line is one line longer than the monthly one; at card widths between 280 and ~300px it can wrap to two lines, nudging the list down by a line when the interval toggles. Not visible at any of the four checked widths; if it matters, `plan-card.tsx` could give the sub-line `min-h-[2lh]`.)
- PR note (BRIEF D4): rename the Stripe **product** display names for `site` / `multi_site` to "Kitchen" / "Multi-kitchen" in test + live so Checkout matches; `docs/BILLING.md` and `docs/OWNER-ROADMAP-BRIEF.md` still say "Site" / "Multi-site".
- e2e (BRIEF §5, WS14): add `/pricing?for=owners` shows headings `Free`, `Kitchen`, `Multi-kitchen`.
