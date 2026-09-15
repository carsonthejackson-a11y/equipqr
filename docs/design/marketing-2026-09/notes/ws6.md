# WS6 — Features (`/features`)

Implements README §"2. Features" from `Features.dc.html` with the WS3
primitives. Files: `src/app/(marketing)/features/page.tsx` (rewritten),
`src/app/(marketing)/features/mocks.tsx` (new), `src/app/(marketing)/features/plans-matrix.tsx`
(new). Nothing outside the features folder was edited. The deprecated
`PhoneFrame` / `GuideScreen` / `RequestScreen` shims are no longer imported
anywhere on this page (WS3 can delete them once WS5 has also moved off them).

## Sections, in the design's order

1. **Hero** — `Section variant="hero"` (bottom padding overridden to the
   design's `clamp(24px,3vw,40px)`), `SectionHeader` kicker "Features" /
   H1 / lead (`max-w-[760px]`, lead `56ch`), in a `Reveal`.
2. **JumpNav** — label "Outcomes", pills `01 Faster resolution`,
   `02 Fewer truck rolls`, `03 A more professional presence`, aside
   "What's on which plan →" → `#plans` (hidden ≤1040px by the primitive).
3. **Outcome 01 `#resolution`** — header grid (kicker + `h2-outcome` left,
   16.5px/1.6/52ch intro right, `items-end`), then rows: Guides that draft
   themselves (+ 3-item `FeatureList` at 14.5px, `GuideMock`), An assistant
   for what the script missed (`visualLeft`, tag "Pro and above · Kitchen and
   above", `AssistantMock`), Routing that doesn't need a dispatcher
   (`RoutingMock`).
4. **Outcome 02 `#truck-rolls`** (`rule`) — Requests that arrive
   dispatch-ready (`RequestEmailMock`), A history on every unit (`visualLeft`,
   `HistoryMock`), then the two-up cards Maintenance before the failure /
   Records that keep up with the route (`Panel`, 1 col ≤560px).
5. **Outcome 03 `#presence`** (`rule`) — Your name on the machine (tag
   "Pro and above · Multi-kitchen", `BrandingMock` = `TagMock` default +
   branded with captions and the customer page frame), Stickers, printed your
   way + Tag first, claim on-site (one `FeatureRow` with a second H3 in its
   copy column, `visualLeft`, `BatchMock`), the **Sticker sizes** panel
   (`Panel as="section"`, four layouts: `TagMock`, `InstructionTagMock`,
   `TagStripMock`, `TagStripMock variant="branded"`, four check facts), then
   the two-up cards A crew-shaped account / Isolated by design, open on request
   ("How security works" → `/security`).
6. **Plans `#plans`** (`rule`) — `SectionHeader` kicker "Plans" / "What's on
   which plan." beside `GhostLink` "Full pricing" → `/pricing`, then
   `PlansMatrix`, then the 13px footnote.
7. **CTA** — `Section variant="cta"` → `CtaPanel` "Ready to put a sticker on
   your first unit?", `Start free trial` → `/signup`, `See pricing` → `/pricing`.

All four anchored sections carry `scroll-mt-[124px]` and the design's
`pt-[clamp(56px,7vw,104px)]`. Every `FeatureRow` gets
`titleClassName="text-[clamp(22px,2vw,26px)] leading-[1.2] tracking-[-0.015em]"`
(WS3 note) and a 24px Lucide leader: ListChecks, MessageSquare, Route,
Camera, History, Calendar, ClipboardList, ShieldCheck, Printer, Scan, Users,
Code. `Reveal` wraps the hero header, each outcome header, each row block,
each two-up grid, the sticker panel, the plans header and table, and the CTA.

## Plans matrix (`plans-matrix.tsx`)

The design is **one** table, six plan columns, with a grouped header row
("Service companies" / "Restaurants & kitchens" in accent, `colspan=3`), a
1px neutral-900 left rule on the first column of each group, "Monthly, billed
monthly" in the first header cell and the bare monthly price (`$29`, `$0`)
under each plan name, `min-width: 820px`, first column 28%. `CompareTable`
renders one audience at a time, so this is a local component on
`ui/table.tsx` using the same cell styles, `CheckIcon`/`XIcon` marks with
`aria-label`, `formatPrice`, and the `CompareRow` type. Plans and names come
from `plans` / `ownerPlans` in `plans.ts`, so "Kitchen" / "Multi-kitchen" show
as soon as WS7 lands D4 (they read "Site" / "Multi-site" until then). The row
set is the design's (`Team members` and `Locations` for both audiences,
`Chat-style AI assistant`, `Pre-printed sticker batches`), not
`providerCompareRows` / `ownerCompareRows`, whose labels and row lists differ
per audience. The batch row is gated on `FEATURES.batchQr` (BRIEF §3.5).
"AI-drafted troubleshooting guides" is ✓ for every service-company plan and
follows `features.aiChat` for restaurant plans, matching both the design and
`ownerCompareRows`.

## Copy / link decisions (design file wins per the common rules)

- Jump-nav pill 03 reads **"A more professional presence"** (the design's
  pill), while the H2 is "A more professional on-site presence". README/the
  task list the long form for the pill; change `jumpItems` if the long form
  is wanted.
- There is no `Plans` pill: the design reaches `#plans` through the
  `data-subnav-aside` link "What's on which plan →" (hidden ≤1040px), which
  is exactly `JumpNav`'s `aside` prop. The README's "sticky list of the
  current section's rows" does not exist in `Features.dc.html`
  (`data-subnav-aside` is only that link), so nothing of the sort was built.
- CTA secondary is **"See pricing" → `/pricing`** as in the design (and the
  current page); the task said `Talk to us` → `/contact`. One-line swap in
  `CtaPanel`'s `secondary` if the brief's version is preferred.
- "14-day" in the footnote and CTA copy is `{TRIAL_DAYS}-day` (renders
  identically).
- The design's "How security works" link is raw accent; rendered as
  `text-eq-accent-300` per the accent-text rule.
- The design's rule-to-content gap in the outcome sections is
  `clamp(56px,7vw,104px)`; `Section`'s `rule` uses its fixed
  `clamp(40px,5vw,72px)`. Left as is (see Requests).
- `metadata.description` is the new hero lead.

## Requests (files I don't own)

- `section.tsx`: an optional `ruleClassName` (or `ruleGap`) so a page can
  match the design's larger rule margin; not blocking.
- `phone-mock.tsx`: the `@deprecated` `ScanScreen` / `GuideScreen` /
  `RequestScreen` shims can be deleted once WS5 has stopped importing them
  (this page no longer does).

## Verification

- `npx tsc --noEmit`: no errors in `features/*` (the only error at the time
  was in WS11's in-progress `contact/contact-form.tsx`).
- `npx eslint "src/app/(marketing)/features/"`: clean.
- `grep -n "font-semibold\|font-bold" src/app/(marketing)/features/*` → 0 hits.
- Screenshots at 380 / 760 / 1100 / 1440 in
  `scratchpad/shots/ws6/`; see the report for the checked items.
