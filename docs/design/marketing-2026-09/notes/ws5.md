# WS5 — Home (`/`)

Implements README "1. Home" from `Home.dc.html` with the WS3 primitives.
Files changed: `src/app/(marketing)/page.tsx` (rewritten) and this note.

## Sections (design order)

1. **Hero** — `Section variant="hero"` with the design's two-column grid
   (`minmax(min(100%,400px),1fr)`, gap `48px clamp(32px,5vw,80px)`). Left, in a
   `Reveal`: eyebrow pill (`Scan` 16px accent), H1 `headingClass["h1-hero"]` as two
   block spans "Scan the tag." / "Fix it, or file the request.", lead, `Start free
   trial` (`brand`, xl, `h-[46px] px-5`, arrow) → `/signup`, `See how it works`
   (`neutral`, xl) → `#how-it-works`, four-item check list. Right, in one
   `Reveal delayMs={120}`: the staff-report phone (`PhoneFrame rotate={-4}
   className="translate-y-[22px]"`, Header → Prompt → Options(selected 1) →
   InputRow) and the confirmation phone (`rotate={4}`, CheckCircle → Title →
   Note → Card "Already tried" → PhotoGrid → Primary), hidden `max-[560px]:hidden`.
2. **Social proof** — `const showSocialProof = false`; `SocialProofBand()` (caption +
   five dashed 140×44 slots between divider rules) renders only when flipped.
   **Facts band** (`data-facts` in the design, not in the README list) is
   rendered: four accent-bordered stats `3 taps · 0 apps · {TRIAL_DAYS} days ·
   10 units`, 4 → 2 (≤820) → 1 (≤560) columns.
3. **How it works** — `id="how-it-works"` (Section adds `scroll-mt-20`),
   SectionHeader, then three `Step` rows (48px accent number column, H3
   `clamp(22px,2vw,26px)`, 16px + 14px paragraphs, mock beside) separated by
   the design's neutral-700 faded rules. Mocks: `TagMock` (208px, rotate −2°),
   a local guide-step card (uses `PhoneOptions` + `PhoneInputRow`), and a local
   request-email card (`Tag variant="neutral"` chips, `PhoneCard` "AI summary").
4. **The dashboard** — header row (SectionHeader + 15px side note) and the
   `DashboardFrame` + `DashboardSidebar` (hidden ≤820 by the primitive) +
   Toolbar + Stats + Table/Rows, in `Reveal delayMs={100}`.
5. **What changes** — six `Panel`s, `grid-cols-3 max-[1100px]:grid-cols-2
   max-[560px]:grid-cols-1`, 22px accent icon, 18px H3, 15px copy, hover lift.
6. **Who it's for** — two `Panel`s with `Kicker`, H3, `FeatureList`, then
   `Start free trial` → `/signup` / `See features` GhostLink → `/features` /
   "From $29/mo"; `Start free` → `/signup?kind=owner` / `For restaurants`
   GhostLink → `/restaurants` / "Free, then from $24/mo".
7. **Everything in the box** — SectionHeader (max-w 440) + `All features`
   GhostLink → `/features`; `data-caps` grid of eight `IconRow titleAs="div"`,
   two columns, one ≤560.
8. **Kitchen first** — a `Panel` (16px radius) with SectionHeader (H2 override
   `clamp(24px,2.6vw,32px)`) and the equipment-type pills (last one dashed).
9. **Versus a general CMMS** — CSS grid (`data-compare`), not a table:
   header row hidden and single column ≤640px.
10. **Quote** — omitted (D7 placeholder).
11. **Questions** — SectionHeader with the `full FAQ` link → `/faq` and a
    `FaqList` of the five questions the design shows, in its order.
12. **Built on a real route** — 40px `LogoMark` accent, H2
    `clamp(22px,2.2vw,28px)`, paragraph, `About EquipQR` GhostLink → `/about`.
13. **CTA** — `Section variant="cta"` + `CtaPanel` "Put a tag on your first
    machine today.", `Start free trial` → `/signup`, `Talk to us first` →
    `/contact`, note "Cancel anytime from Settings → Billing…".

## Copy / link decisions

- Copy is verbatim from `Home.dc.html`. Where the README summary and the design
  HTML differ (dashboard H2 "…comes in after.", caps H2 "…run the whole route
  on.", kitchen H2 "…not adapted from a warehouse tool.") the design HTML wins.
- `14` is interpolated as `{TRIAL_DAYS}` in the hero check list, the facts band
  and the CTA copy (BRIEF §3.5, as the old page did).
- FAQ subset: Q1/Q2/Q3/Q5 are `productFaqs` entries (Q1 = "Do my customers need
  to download an app or make an account?" — the design's wording differs; the
  faq-data entry is used). Q4 "What happens if a vendor doesn't respond?" only
  exists in `ownerFaqs`, so it is taken from there. Entries are matched by a
  stable question fragment, not by index, so WS7's rewording can't drop a row.
- Hero phones follow the design HTML (two phones, −4°/+4°, first shifted 22px)
  rather than the README's "one phone at 2°" summary; the second hides ≤560
  per README "Phone mock". The single `Reveal delayMs={120}` wraps the pair.
- The README's "optional column hidden ≤700px" for the compare grid has no
  counterpart in the design (`data-col-opt` is only used in the dashboard
  table, which `DashboardTable` handles), so no compare column is hidden.
- Benefit and "Who it's for" grids are revealed as one group (hard rule: card
  grids, not individual cards) instead of the design's per-card stagger.
- The Facts band gets an intermediate 2-column step at ≤820px; the design only
  goes 4 → 1 at 560, which leaves 100px columns between 560 and ~700.
- `metadata`: absolute title "EquipQR — Scan the tag. Fix it, or file the
  request.", description from the hero copy, `openGraph.description` stays
  `SITE_DESCRIPTION`. The JSON-LD block is kept.
- Old `features` / `industries` / `steps` data, the pricing teaser and the
  deprecated `ScanScreen` / `GuideScreen` / `RequestScreen` imports are gone;
  `phone-mock.tsx` can drop the shims once WS6 stops importing them too.

## Requests

- `tag-mock.tsx`: a `size` (or `qrSize`) prop. The Home step-1 tile is 208px
  with a 96px QR and 11/12/10.5px type; today it is rendered via `className`
  overrides (`size-[208px] p-4 rounded-[14px]`) so the QR stays 78px and the
  type at the 176px sizes.
- `feature-list.tsx`: an optional check size (the "Who it's for" lists use 18px
  checks and `gap: 12px` in the design; `className="gap-3"` covers the gap).
- `phone-mock.tsx`: delete the `@deprecated` `ScanScreen` / `GuideScreen` /
  `RequestScreen` shims once `features/page.tsx` no longer imports them.

## Verification

- `npx tsc --noEmit`: no errors in `page.tsx` (the only error in the tree at the
  time was WS11's `contact/contact-form.tsx`, not owned here).
- `npx eslint "src/app/(marketing)/page.tsx"`: clean.
- `grep -n "font-semibold\|font-bold"` on the two files: no hits.
- Screenshots at 380 / 760 / 1100 / 1440 under `scratchpad/shots/ws5/` — see
  the report for the state at the time (the dev server 500'd on every route
  while WS11's `contact/actions.ts` exported non-async values from a
  `"use server"` file).
