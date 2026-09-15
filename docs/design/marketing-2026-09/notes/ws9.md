# WS9 — FAQ (`/faq`)

Implements `FAQ.dc.html` / README "5. FAQ" / BRIEF WS9. Files changed:
`src/app/(marketing)/faq/page.tsx` only (plus this note). Server component,
no client code of its own (`Reveal` is the only client primitive used).

## Structure (design order)

1. **Hero** — `Section variant="hero"` (`aria-labelledby="page-title"`), bottom
   padding overridden to the design's `clamp(24px,3vw,40px)`. `Reveal` wraps
   the 760px block: `Kicker` "FAQ", H1 `headingClass.h1` "Frequently asked
   questions.", lead (`leadClass`, `max-w-[56ch]`) with `Get in touch` →
   `/contact` as a `Link`.
2. **JumpNav** — `ariaLabel="Question groups"`, pills `01 Product`, `02 Billing`,
   `03 Restaurants & kitchens` → `#product` / `#billing` / `#restaurants`
   (the third pill is derived from the same `groups` array, so it disappears
   with `showRestaurants`).
3. **Groups** — one `Section` each (`id`, `aria-labelledby="<id>-title"`,
   `scroll-mt-[124px]`, top padding `clamp(48px,6vw,88px)`; `rule` on Billing
   and Restaurants). `Reveal` wraps the two-column grid
   (`auto-fit minmax(min(100%,300px),1fr)`, gap `32px clamp(32px,5vw,80px)`,
   `items-start`), exactly where the design puts `data-reveal`. Left column
   `max-w-[400px] min-[761px]:sticky top-[136px]`: `Kicker` `01 · Product`
   (numeral `tabular-nums`), H2 `headingClass.h2`, `introClass` line with the
   related-page link (`Features` → `/features`, `pricing page` → `/pricing`,
   `restaurants page` → `/restaurants`). Right column `FaqList` with
   `openFirst` — `productFaqs` (6), `billingFaqs` (6), `ownerFaqs` (5).
4. **CTA** — `Section variant="cta"` → `Reveal` → `CtaPanel` "Still have
   questions?" / "Ask us directly, or start the trial and scan your first
   sticker yourself." `Contact us` (brand) → `/contact`, `Start free trial`
   (neutral) → `/signup`.

Flags kept as module consts with a comment: `openFirst = true`,
`showRestaurants = true` (README `data-props`). `scrollReveal` is the `Reveal`
primitive's `enabled` default.

`metadata`: title "FAQ" kept; description refreshed to mention billing and the
restaurants/kitchens group.

## Copy / link decisions

- Inline links use `text-primary underline underline-offset-[3px]` at rest and
  `hover:text-eq-accent-300` (design: raw accent + 3px underline; README
  "Hover: links … accent-300"). Paragraph text itself is neutral-300/400.
- The CTA panel puts the trailing arrow on the primary (`Contact us`) button,
  as `CtaPanel` and the common rules require; the design draws the arrow on
  the secondary `Start free trial` instead. Kept the primitive's behaviour.
- `Section`'s `rule` prop uses `mb-[clamp(40px,5vw,72px)]`; the design's rule
  above Billing/Restaurants uses `clamp(48px,6vw,88px)`. Kept the primitive.
- The hero H1 and all headings are `font-medium` via `headingClass`.

## Requests (files I do not own)

- `src/app/(marketing)/_components/faq-data.ts` — the design's FAQ answers
  differ from the current strings and I cannot edit the data module:
  - `ownerFaqs[0]` says "Site and Multi-site add more equipment…"; the design
    (and BRIEF D4) says "Kitchen and Multi-kitchen add more equipment…", and
    "You're never locked out…" as a new sentence (no "— but").
  - `ownerFaqs[1]` design: "Every plan includes unlimited staff…" (code:
    "Every owner plan includes…").
  - `billingFaqs[5]` ("Can I cancel anytime?") design ends with
    "Questions? Get in touch." where "Get in touch" links to `/contact`; code
    ends with "Questions? Email ${SUPPORT_EMAIL}." `FaqEntry.answer` is a
    `string`, so a link needs either `answer: ReactNode` in `faq-item.tsx` or
    the design's wording without the link.
  - Several answers use em dashes where the design uses commas/colons/periods
    (e.g. "mobile web page: no app store…", "Review it, edit any step, and
    publish. Every unit…", "ahead of a route. Good for stocking…",
    "A plain "this isn't set up yet…" message. No dead links…",
    "…they can claim it to a piece of equipment on the spot, including
    photographing the nameplate…", "…full Pro features unlocked. No credit
    card required to start; you'll only be asked…", "…add equipment. Your
    existing units…", "…paying monthly. You pay for 10 months…",
    "…your card number, only Stripe's tokenized reference…", and the owner
    answers' "— " → ". " / ", "). Whoever owns `faq-data.ts` (shared with
    Home, Pricing and Restaurants) should decide whether to adopt the design
    punctuation verbatim.

## Verification

- `npx tsc --noEmit` clean; `npx eslint src/app/(marketing)/faq/page.tsx`
  clean; `grep -n "font-semibold\|font-bold"` on the page → 0 hits.
- Screenshots at 380 / 760 / 1100 / 1440 in
  `scratchpad/shots/ws9/faq-<w>.png`: no horizontal overflow
  (`scrollWidth === innerWidth` at 380 and 1440), zero console errors or
  warnings, no hydration warnings in the dev log for `/faq`.
- Playwright checks: jump nav `position: sticky; top: 64px`; left aside
  `sticky; top: 136px` at 1440 and `static` at 380; every group
  `scroll-margin-top: 124px`; 3 of 17 `<details>` open on load (first per
  group); clicking `02 Billing` lands with the Billing heading fully visible
  under the header + nav; reveal wrappers go `hidden` → `visible` while
  scrolling without reduced motion and stay visible with it.
