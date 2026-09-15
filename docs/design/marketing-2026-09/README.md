# Handoff: EquipQR marketing site + brand refresh

## Overview

A redesign of the EquipQR marketing site (all routes under `src/app/(marketing)/`) plus a new brand mark and wordmark. The redesign moves the site from the current light theme (teal primary, Geist Sans, Lucide `QrCode` mark) to a dark, compact "Nocturne"-style system with a single green accent, a custom "Scan Q, arrow" mark, and a DM Sans wordmark. Every marketing route has a matching design file; the header and footer are shared components.

Target repo: `carsonthejackson-a11y/equipqr` (Next.js App Router, Tailwind, shadcn-style components, Lucide icons). The `## Repo mapping` section at the bottom ties each design file to the source files it replaces.

## About the design files

The `.html` files in this bundle are **design references built in HTML**. They show the intended look, copy, layout, responsive behavior, and interactions. They are not production code to copy directly.

The task is to **recreate these designs inside the existing Next.js codebase** using its established patterns: Tailwind utilities, the existing `Button`/`Card` primitives where they fit, Lucide icons, `next/font` for DM Sans, and the existing `plans.ts` / `faq-data.ts` / `site.ts` data modules. Where the design's tokens differ from the current `globals.css` (they do, see Design tokens), update the CSS variables there rather than hard-coding values in components.

Open any `.html` file directly in a browser to view it. They are self-contained except for the shared `_ds/.../styles.css` (included) and Google Fonts (DM Sans, loaded from the network).

## Fidelity

**High-fidelity.** Colors, type sizes, spacing, radii, shadows, copy, hover states, and responsive breakpoints are final. Recreate pixel-for-pixel using the codebase's own primitives. Two exceptions:

- Illustrative mockups (phone screens, dashboard mock, tag mock, timeline card) are static HTML drawings in the design. Rebuild them as static presentational components; they do not need to be live.
- Placeholder slots (customer logos, quote avatar, "photo from the route" on About, "Your logo" on the tag mock) are empty drop targets in the design. Ship them only once real assets exist, otherwise omit the containing element (the Home social-proof band has a `showSocialProof` flag for exactly this).

## Design tokens

All values come from `_ds/nocturne-.../styles.css` (bundled) with the accent overridden to EquipQR green on every page root. Map these onto the CSS variables in `src/app/globals.css`.

### Color

Ground and text
- `--color-bg` `#161826` page background
- `--color-surface` `#232532` cards, panels, segmented controls, table frame
- `--color-text` `#e9e9ed` primary text
- `--color-divider` `color-mix(in srgb, #e9e9ed 16%, transparent)` header/footer rules

Neutral ramp (borders, muted text)
- `--color-neutral-100` `#f3f5fe` light tag-mock background
- `--color-neutral-200` `#e4e7f5` emphasized body / blockquote text
- `--color-neutral-300` `#cfd3e5` body copy, feature-list text, lead paragraphs
- `--color-neutral-400` `#b2b6ca` secondary copy, card descriptions
- `--color-neutral-500` `#9397ab` meta, kickers, table sub-labels, footer small print
- `--color-neutral-600` `#75798c` empty-state dot outlines
- `--color-neutral-700` `#595d6c` card hover border, "not included" X icon, dashed placeholders
- `--color-neutral-800` `#3f424d` FAQ row rules, phone bezel border, chip borders
- `--color-neutral-900` `#292b31` default card border, table frame

Accent ramp (EquipQR green; overrides the DS default blurple on every page)
- `--color-accent` / `-500` `#3ecf8e` primary: icons, kickers, active nav, primary-button outline, checkmarks, mark
- `--color-accent-100` `#ecf9f1`
- `--color-accent-200` `#d2f1de` selected symptom-chip text
- `--color-accent-300` `#a7e5c2` link hover, FAQ summary hover; use for accent-colored paragraph text (contrast)
- `--color-accent-400` `#56d396` pressed state on dark ground
- `--color-accent-600` `#05915e`
- `--color-accent-700` `#007047`
- `--color-accent-800` `#045032`
- `--color-accent-900` `#093421` radial glows behind hero and the highlighted plan card

Accent tints used via `color-mix(in srgb, var(--color-accent) N%, transparent)`: 8% (jump-nav hover, contents hover), 9% (highlighted-card 4px ring), 12% (selected chip fill), 16% (success/check circle).

Phone bezel: `#0d0f18` (the only non-token color; it is the bezel black, deliberately darker than the ground).

### Typography

- Body / UI: `Inter`, system-ui fallback. `--font-body`, `--font-heading`. Weight 400 for copy, **500 for every heading and emphasized label. Never bolder than 500.**
- Wordmark only: `DM Sans` 500, `letter-spacing: -0.02em`. Google Fonts URL: `https://fonts.googleapis.com/css2?family=DM+Sans:wght@500&display=swap`. In Next.js load via `next/font/google` and apply only to the wordmark span.
- Monospace (legal `/e/` code chip only): `ui-monospace, SFMono-Regular, Menlo, monospace` at 0.9em.
- Numerals in prices, times, counts, and table cells: `font-feature-settings: 'tnum' 1`.
- `text-wrap: pretty` on the page root.

Scale (all fluid via `clamp`):
- Page H1: `clamp(36px, 4.4vw, 58px)` / line-height 1.06 / letter-spacing -0.025em. Home hero uses `clamp(38px, 4.8vw, 62px)` / 1.04.
- Section H2: `clamp(28px, 3.2vw, 40px)` / 1.12 / -0.02em. Features "Outcome" H2s: `clamp(32px, 3.8vw, 48px)` / 1.08 / -0.025em. Restaurants story/how H2: `clamp(30px, 3.4vw, 44px)` / 1.1.
- Sub-section H2 (staff/owner view, CTA cards): `clamp(26px, 3vw, 38px)` / 1.12 / -0.02em.
- Legal section H2: `clamp(20px, 1.8vw, 24px)` / 1.3 / -0.015em.
- Card title H3: 19px / 1.3 / -0.01em. Feature-row H3: 16px / 1.4.
- Lead paragraph: `clamp(16px, 1.3vw, 18px)` / 1.6 / neutral-300.
- Body: 16px / 1.6 (legal body 1.7); card copy 15px or 14.5px / 1.55–1.6 / neutral-400.
- Kicker (section label above headings): 13px, `letter-spacing: 0.06em`, uppercase, accent. Footer column labels: 12px / 0.08em / neutral-500.
- Meta / small print: 13px–13.5px / 1.5 / neutral-500. Table sub-labels 12px.
- Plan price: `clamp(38px, 3.4vw, 46px)` / 500 / -0.03em / line-height 1, unit 15px neutral-500 on the same baseline.
- Stat numeral (Restaurants 49%): `clamp(44px, 5vw, 64px)` / -0.035em / accent.
- Pull line (About): `clamp(24px, 2.4vw, 32px)` / 1.25 / -0.02em / 500, 2px accent left border, 20px left padding.
- Nav links 14px; buttons 14px (header, 36px tall), 15px (page, 44–46px tall).

### Spacing and layout

- Content container: `max-width: 1200px; margin: 0 auto; padding-inline: clamp(20px, 5vw, 72px)`.
- Section vertical padding: top hero `clamp(56px, 7vw, 104px)`; between sections `clamp(40px, 5vw, 72px)` top / `clamp(24px, 3vw, 48px)` bottom; final CTA section bottom `clamp(72px, 9vw, 128px)`.
- Section divider: 1px tall, `linear-gradient(to right, transparent, var(--color-divider) 48px, var(--color-divider) calc(100% - 48px), transparent)`, margin-bottom `clamp(40px, 5vw, 72px)`. Rules fade at their ends; never a solid full-width hairline.
- Two-column sections: `display:grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300–400px), 1fr)); gap: 32–48px clamp(32px, 5vw, 80px)`. Text column left, visual right, except where `data-visual-left` flips it on desktop and `order: 2` puts it under the text below 760px.
- Card grids: `repeat(auto-fit, minmax(min(100%, 260–280px), 1fr)); gap: 16px`.
- Card padding: `clamp(22px, 3vw, 28px)` (plan/step cards), `clamp(20px, 3vw, 26px)` (security rows). Inner vertical gap 14–20px.
- Feature list rows: `gap: 10px`, 16px check icon with `margin-top: 3px`.
- FAQ rows: summary padding `18px 0`, answer `margin: 0 0 18px`, `max-width: 60ch`.
- Sticky asides on desktop: `position: sticky; top: 88px` (min-width 761px). FAQ page group headings stick at `top: 136px` because of the sticky jump nav.

### Radius

- 8px buttons, inputs, chip rows, small tiles, nav link hover (`--radius-md`)
- 10px segmented control, phone inner tiles, contact info cards
- 12px legal notice, tag mock, dashboard mock frame
- 14px cards, table frame (`--radius-lg`)
- 16px contact form panel
- 20px final CTA panel
- 30px phone screen / 38px phone bezel
- 999px chips, jump-nav pills, tags

### Elevation

- `--shadow-sm` `0 0 0 1px #3f424d` (contact form panel, tag mock)
- `--shadow-md` `0 0 0 1px #595d6c, 0 6px 18px rgba(0,0,0,0.55)` (phones, timeline card, dashboard mock, highlighted plan card)
- Highlighted plan card ring: `0 0 0 4px color-mix(in srgb, var(--color-accent) 9%, transparent), var(--shadow-md)` with a 1px accent border.
- Default card: 1px `neutral-900` border, no shadow; hover border `neutral-700`, `transition: border-color .2s ease`.

### Backgrounds

Page root: `radial-gradient(1200px 720px at 82% -160px, color-mix(in srgb, #093421 72%, transparent), transparent 60%), radial-gradient(1100px 800px at -10% 100%, rgba(0,0,0,0.3), transparent 55%), var(--color-bg)`.

Highlighted plan card: `radial-gradient(420px 240px at 50% -80px, color-mix(in srgb, var(--color-accent-900) 70%, transparent), transparent 70%), var(--color-surface)`.

Final CTA panel: `radial-gradient(760px 380px at 85% 115%, color-mix(in srgb, var(--color-accent-900) 85%, transparent), transparent 62%), var(--color-surface)`, 1px `neutral-900` border, radius 20px, padding `clamp(36px, 5vw, 64px) clamp(24px, 5vw, 64px)`, two-column `auto-fit minmax(min(100%, 360px), 1fr)`.

Sticky header / jump nav: `background: color-mix(in srgb, var(--color-bg) 84%, transparent); backdrop-filter: blur(14px)`, 1px `--color-divider` bottom border.

## Brand

### Mark: "Scan Q, arrow"

A QR finder pattern whose fourth corner opens into an arrow. Master file: `assets/equipqr-mark.svg` (100×100 viewBox, stroke-based, `currentColor` so it takes the accent from CSS). Geometry, all strokes `stroke-linecap: square; stroke-linejoin: miter`:

- Three corner brackets, stroke 9: `M14 36V14h22`, `M56 14h22v22`, `M14 56v22h22`
- Center square, stroke 7: `rect x=31 y=31 w=30 h=30`
- Center dot, filled: `rect x=40 y=40 w=12 h=12`
- Arrow tail, stroke 9: `line 74,74 → 84,84` and `M72 88h16V72`

Usage in the design: 26px in the header, 24px in the footer, 18px in the dashboard mock sidebar, 40px next to the About-teaser on Home. Below 24px use the simplified variant in `Brand Board.dc.html` (`#eqs` symbol). Full lockup, sizing, color-variant, and "don't" rules are on the Brand Board.

Replaces `src/components/logo.tsx` (Lucide `QrCode`), `src/app/icon.tsx` (serif "Q" favicon), and `opengraph-image.tsx`.

### Wordmark

`EquipQR` set in DM Sans 500, `letter-spacing: -0.02em`, `line-height: 1`. 19px in the header, 18px in the footer, with a 10px gap to the mark. On the Brand Board the "QR" is accent-colored; on the site header/footer the whole word is text-colored.

### Color

One brand color, `#3ecf8e`, used as line, mark, and glow. No large accent fills anywhere; the only tinted fields are the highlighted plan card glow and the CTA panel glow, both at ≤ 85% of the 900 step.

## Shared components

### SiteHeader (`SiteHeader.dc.html` → `site-header.tsx`)

- `position: sticky; top: 0; z-index: 50`, 64px tall, blurred background (see Backgrounds).
- Left: mark (26px, accent) + wordmark, links to `/`.
- Right (≥ 881px): nav links Features, Pricing, Restaurants, FAQ, then `Log in` (secondary button) and `Start free trial` (primary), both 36px tall, 14px, padding `0 14px`, 8px gap.
- Nav link: 36px tall, `padding: 0 12px`, radius 8px, 14px, `neutral-400`; active route is accent-colored with `aria-current="page"`. Hover: text color to `--color-text`.
- ≤ 880px: nav and buttons hide; a 44×44 icon button (secondary style, `aria-expanded`) toggles a panel under the header with the same links at 44px min-height / 16px, then stacked full-width Log in + Start free trial buttons. Panel background `--color-bg`, 1px divider top.
- The `active` prop ↔ `usePathname()`.

### SiteFooter (`SiteFooter.dc.html` → `site-footer.tsx`)

- 1px `--color-divider` top border. Container padding `56px inline 36px`.
- Row 1, flex-wrap, gap `40px 56px`: brand column (`flex: 1 1 260px; max-width: 340px`) with mark 24px + wordmark 18px, one-sentence description (14px / 1.6 / neutral-400), and `support@equipqr.co` (14px, neutral-400 → text on hover). Then three link columns (`flex: 1 1 120px`, gap 12px): Product (Features, Pricing, For restaurants, FAQ, Security), Company (About, Contact), Legal (Terms of service, Privacy policy). Column labels 12px uppercase 0.08em neutral-500; links 14px neutral-300 → text on hover, `transition: color .15s ease`.
- Row 2: faded divider, then a 13px neutral-500 row with `© 2026 EquipQR. All rights reserved.` left and `Built by a working repair technician in Dallas–Fort Worth.` right, wrapping on narrow screens.

### Buttons (Nocturne `.btn`)

Outlined, never filled. `btn-primary`: 1px accent border, accent text, transparent fill; hover tint from the accent ramp, pressed `accent-400`. `btn-secondary`: 1px neutral border, text color. `btn-ghost`: no border, used for "All features →" style inline links. `btn-block` stretches. Arrow icon (`i-arrow`, 16px) trails primary CTAs with a normal gap. Focus: `outline: 2px solid var(--color-accent); outline-offset: 2px`. Map onto the existing `Button` variants; adjust the variant styles in one place.

### Tags (`.tag`)

`tag-accent`: accent-tinted small label, used for "Most popular", "Sent", "Acknowledged", "2 months free" (10.5px, `padding: 2px 7px` in the billing toggle). `tag-outline`: neutral outline, used for the plan name in the owner dashboard mock.

### Segmented control (`.seg` + `.seg-opt`)

Radio inputs inside labels. Container: `--color-surface`, radius 10px. Option: 40px tall, `padding: 0 16px`, 14px / 500. Checked option takes the accent outline. Used twice on Pricing (audience, billing interval).

### Table (`.table`)

Used on Pricing compare. Wrapped in a `neutral-900` 1px border, radius 14px, `overflow-x: auto`, `min-width: 640px`. Header cells: first column left-aligned 12px / 400 / neutral-500 (shows the billing interval), plan columns centered with a 14px name (accent for the highlighted plan) and a 12px price sub-label. Body cells `padding: 12px` (first column `12px 20px`, weight 500); values neutral-300 with `tnum`; included = 18px accent check (`aria-label="Included"`), not included = 18px `neutral-700` X (`aria-label="Not included"`).

### Accordion (FAQ rows)

Native `<details>/<summary>`. Row: 1px `neutral-800` top border (last row also bottom). Summary: flex, space-between, 16px / 500, `padding: 18px 0`, cursor pointer, hover color `accent-300`, default marker hidden. Trailing 18px chevron (`neutral-500`) rotates 180° when open, `transition: transform .2s ease`. Answer: 15px / 1.6 / neutral-400 / `max-width: 60ch`. If you keep `faq-item.tsx` (Radix/shadcn accordion), restyle it to these values.

### Icons

Every icon in the design is a 24-viewBox, 1.75-stroke, square-cap, miter-join line icon (checks are stroke 2). Lucide is the closest match already in the repo; use it and set `strokeLinecap="square" strokeLinejoin="miter"` via props or a wrapper so corners stay sharp. Sizes: 16px inline in lists/buttons, 18px table marks, 22px feature-row leaders, 24px section leads.

### Phone mock

Bezel: `width: 236px; border-radius: 38px; background: #0d0f18; border: 1px solid neutral-800; padding: 8px; box-shadow: var(--shadow-md)`, rotated ±2–3°. Screen: `height: 452px; border-radius: 30px; background: --color-surface; padding: 42–46px 14px 14–16px; inset 0 0 0 1px neutral-900 ring`, flex column, gap 9–10px. Dynamic island: 72×20px, radius 10px, `#0d0f18`, centered at `top: 12px`. Contents are 10.5–15px type; symptom chips are 999px-radius, `padding: 6px 10px`, 11.5px, `neutral-800` border; the selected chip has an accent border, 12% accent fill, `accent-200` text, weight 500. Primary action at the bottom: full-width, `padding: 10px`, radius 8px, accent outline, 12px / 500. Second phone (confirmation) hides below 1100px (Restaurants) / 560px (Home).

### Scroll reveal

Elements marked `data-reveal` start `opacity: 0; transform: translateY(14px)` and transition to visible (`opacity .7s, transform .7s`, easing `cubic-bezier(.2,.7,.2,1)`) when an `IntersectionObserver` (`threshold: 0.12; rootMargin: 0 0 -6% 0`) sees them. Anything already above 92% of the viewport height on mount is shown immediately (no flash). Disabled entirely under `prefers-reduced-motion: reduce`, and by the `scrollReveal` flag. Implement once as a small client component or hook and wrap sections in it. Hero phone gets `transition-delay: 120ms`.

## Screens

Every page: page root as described in Backgrounds, `SiteHeader` sticky at top with the matching `active` value, content sections, final CTA panel, `SiteFooter`. Copy below is exact; keep it verbatim (it is also in the HTML files).

### 1. Home (`Home.dc.html` → `/`)

Purpose: explain the product in one scroll for both audiences and get a trial signup.

Sections, in order:
1. **Hero**, two columns (`minmax(min(100%, 400px), 1fr)`, gap `48px clamp(32px, 5vw, 80px)`, `align-items: center`). Left: eyebrow pill ("Purpose-built for commercial kitchen equipment"), H1 in two lines "Scan the tag." / "Fix it, or file the request.", lead paragraph, CTA row (`Start free trial` primary with arrow, `See how it works` secondary → `#how-it-works`), small print under it. Right: staff-report phone mock, rotated 2°.
2. **Social proof band** (behind `showSocialProof`): 13px caption "Service companies and kitchens running on EquipQR" and five 140×44 logo slots in an auto-fit grid. Omit until logos exist.
3. **How it works**: kicker, H2 "From the machine to resolved, in three steps.", intro, three numbered step cards (01/02/03 in accent 13px, H3 19px, copy 15px).
4. **The dashboard**: kicker, H2 "One place for the tags, the guides, and everything that comes off them.", 15px side note, then a dashboard mock: 12px radius frame, `208px | 1fr` grid with a sidebar (hidden ≤ 820px) and a main panel of request rows. Static illustration.
5. **What changes**: kicker, H2 "Fewer trips, faster fixes, and a record on every unit.", six benefit cards in a 3-col grid (2 cols ≤ 1100px, 1 col ≤ 560px), each with a 22px icon, H3 16px, copy 14.5px.
6. **Who it's for**: H2 "Built for both sides of the service call.", two cards (service companies / restaurants & kitchens), each with a feature list and a ghost link to Features or Restaurants.
7. **Everything in the box**: H2 "Small enough to set up in an afternoon. Complete enough to run the route on.", paragraph, ghost "All features →", and a capability grid (`data-caps`, 1 col ≤ 560px).
8. **Kitchen first**: H2 "Made for the machines in a commercial kitchen, not adapted to them.", copy, list of equipment categories.
9. **Versus a general CMMS**: H2 "Dead simple to start. That's the point.", comparison grid (`data-compare`; header row hidden and single column ≤ 640px; optional column hidden ≤ 700px).
10. **Quote** (placeholder): blockquote `clamp(22px, 2.4vw, 32px)` with hanging punctuation (`text-indent: -0.474em`), 44px circular avatar slot, attribution. Omit until a real quote exists.
11. **Questions**: kicker, H2 "The things people ask before their first sticker.", link to FAQ, five-row accordion (subset of Product FAQs).
12. **Built on a real route, not a whiteboard.**: 40px mark, H2 `clamp(22px, 2.2vw, 28px)`, paragraph, ghost "About EquipQR →".
13. **CTA panel**: H2 "Put a tag on your first machine today.", copy, `Start free trial` primary + `Talk to us` secondary → `/contact`.

Flags: `showSocialProof` (default on), `scrollReveal` (default on).

### 2. Features (`Features.dc.html` → `/features`)

Purpose: the full feature tour, grouped by the outcome each feature buys.

- Hero: kicker "Features", H1 "Everything between a scan and a fixed unit.", lead.
- Sticky jump nav under the header (same blur treatment as the header; `top: 64px; z-index: 40`): "Jump to" label (hidden ≤ 720px) and pill links `01 Faster resolution`, `02 Fewer truck rolls`, `03 A more professional on-site presence`, `Plans`. Pill: 34px tall, `padding: 0 12px`, radius 999px, 1px `neutral-800` border, 13px, neutral-300; hover accent border + 8% accent fill + text color; number in accent with `tnum`.
- Three **Outcome** sections (`Outcome 01/02/03` kicker, H2 `clamp(32px, 3.8vw, 48px)`, intro `16.5px / 1.6 / 52ch`). Each contains 2–4 feature rows: a two-column block with copy (H3 16px, paragraph 14.5–15px, plan availability tag like `Pro and above · Kitchen and above`) on one side and a static mock on the other. Rows alternate sides; `data-visual-left` rows put the mock under the copy below 760px. Mocks include: guide step list, request email summary card, the branded tag (176px square, `neutral-100` background, logo slot, fake QR, "Problem? Scan me first." / "Service by …"), the strip label (176×88), customer page frame, nameplate-scan card, batch-print sheet, schedule list.
- A `data-subnav-aside` sticky list of the current section's rows appears on wide screens only (hidden ≤ 1040px).
- **Plans** matrix: kicker "Plans", H2 "What's on which plan.", ghost "Full pricing →", then a `.table` with a row per feature and a column per plan for both audiences (Starter / Pro / Business, Free / Kitchen / Multi-kitchen). Plan names come from `plans.ts` (see Rename below).
- CTA panel: "Ready to put a sticker on your first unit?" + "Every feature on this page is in the 14-day trial. …", primary `Start free trial`, secondary `Talk to us`.

Flags: `scrollReveal`.

### 3. Pricing (`Pricing.dc.html` → `/pricing`)

Purpose: pick a plan per audience and billing interval; compare limits; answer billing questions.

- Hero: kicker "Pricing", H1 "Pricing that scales with your route.", lead: "Every service-company plan starts with a 14-day free trial with full Pro features unlocked. Restaurants and kitchens start on a free tier that never expires. Hit a limit and you get an upgrade prompt, not an overage fee."
- Controls row (`flex-wrap; space-between; gap 14px 24px`): audience segmented control (`For service companies` / `For restaurants & kitchens`) and interval control (`Monthly` / `Yearly` + `2 months free` accent tag). Deep link: `?for=owners` preselects the restaurant tab (existing behavior in `audience-tabs.tsx`).
- **Plan cards**, 3-up auto-fit `minmax(min(100%, 280px), 1fr)`, `align-items: stretch`; card is a flex column, gap 20px, with the feature list `flex: 1` so buttons align at the bottom.
  - Service companies: **Starter** $29/mo · $290/yr ("For a single truck getting off paper and text threads.") — Up to 50 units of equipment · 2 team members · AI-drafted troubleshooting guides · Service requests with photo & video · Email support → `Start free trial` secondary. **Pro** (highlighted, `Most popular` tag) $79/mo · $790/yr ("For a growing crew that wants fewer truck rolls, not more.") — Up to 300 units · 10 team members · Chat-style AI troubleshooting assistant · Your logo & colors on customer pages · Priority email support → primary. **Business** $199/mo · $1,990/yr ("For multi-crew operations that need it all.") — Up to 1,500 units · Unlimited team members · Everything in Pro · Data export & API access · Priority support → secondary.
  - Restaurants & kitchens: **Free** $0 ("For one site tracking equipment and taking service requests, at no cost." / "Free forever. No credit card, no trial to run out.") — Up to 10 pieces of equipment · 1 location · Unlimited staff and vendor contacts · Service requests with photo & video · Email support → `Get started free`. **Kitchen** (highlighted) $24/mo · $240/yr ("For one kitchen that wants AI troubleshooting and pre-printed QR batches.") — Up to 75 pieces · 1 location · AI-drafted troubleshooting guides · Pre-printed QR code batches · Priority email support → `Start free trial` primary. **Multi-kitchen** $69/mo · $690/yr ("For an owner running several kitchens who wants branding across all of them.") — Up to 400 pieces · Up to 5 locations · Your logo & colors on customer pages · Everything in Kitchen · Priority support → secondary.
  - Price block: big numeral + `/mo` or `/yr`; sub-line "Billed monthly, cancel anytime" or "Works out to $N/mo, billed annually" (yearly = monthly × 10, rounded per month).
  - Footnote under the grid, 13px neutral-500 (text differs per audience, see file).
- **Compare** section: kicker "Compare", H2 "Every limit and feature, side by side.", then the `.table` for the active audience. First header cell reads "Monthly, billed monthly" or "Yearly, billed annually". Rows (providers): Equipment units 50/300/1,500 · Team members 2/10/Unlimited · AI-drafted troubleshooting guides ✓✓✓ · Service requests with photo & video ✓✓✓ · Chat-style AI troubleshooting assistant ✗✓✓ · Pre-printed batch QR sticker orders ✗✓✓ · Your logo & colors on customer pages ✗✓✓ · Data export & API access ✗✗✓ · Support Email/Priority email/Priority. Rows (owners): Equipment units 10/75/400 · Locations 1/1/5 · Staff and vendor contacts Unlimited×3 · Service requests ✓✓✓ · AI-drafted guides ✗✓✓ · Chat-style assistant ✗✓✓ · Pre-printed batch QR ✗✓✓ · Your logo & colors ✗✗✓ · Support Email/Priority email/Priority.
- **Questions**: two-column; left kicker + H2 ("Billing questions." for providers, "Questions from restaurants and kitchens." for owners) + link to `/faq`; right accordion with the billing FAQs (providers) or owner FAQs from `faq-data.ts`.
- CTA panel per audience: "Start on the trial. Pick the plan after." (+ `Start free trial`, `Talk to us`) or "Start on Free. It doesn't expire." (+ `Get started free`, `How it works for kitchens` → `/restaurants`).

State: `audience: 'providers' | 'owners'` (URL `?for=owners` → owners), `interval: 'month' | 'year'`. Both are client state; the cards, table, FAQ, and CTA all switch on `audience`, the prices and table header on `interval`. Flags: `audience`, `defaultInterval`, `scrollReveal`.

**Plan rename (decided during design):** restaurant plans display as **Kitchen** ($24) and **Multi-kitchen** ($69) instead of "Site" and "Multi-site". Change `name` in `src/lib/plans.ts` for the `site` and `multi_site` plans; ids stay the same. Prose that referenced the old names was reworded ("Everything in Kitchen", "For one kitchen …", "several kitchens").

### 4. Restaurants (`Restaurants.dc.html` → `/restaurants`)

Purpose: the owner-side pitch: any staff member can send the right vendor a work order.

- Hero, two columns: kicker "For restaurants & kitchens", H1 "Tag the kitchen. Any cook can send the right vendor a work order.", lead, `Start free` primary + `See how it works` secondary → `#how-it-works`, small print "Free forever for one location · no credit card". Right: staff phone (Sunrise Diner / Ice machine / symptom chips with "Not making ice" selected / photo row / urgency "We can't operate without this" / `Send work order`).
- **The moment it's for**: H2 "It's 7:40 pm on a Friday." with two paragraphs, beside a timeline card (14px radius, surface, `shadow-md`, 12.5px type): header "Dish machine · Back kitchen" + `Sent` tag; three timestamped rows (7:40 / 7:41 / 7:41) in a `56px 12px 1fr` grid with dot-and-line connectors (first dot neutral-500, later dots accent); dashed footer note "No lookup, no group text, no waiting for the right phone." Below (behind `showStat`): a stat band card with "49%" in accent and the attributed MachineQ sentence + 12.5px source line.
- **How it works** (`id="how-it-works"`, `scroll-margin-top: 80px`): H2 "Four steps, no phone tree.", side note, four numbered cards (`minmax(min(100%, 260px), 1fr)` so it breaks 4 → 2+2 → 1): Tag it · Staff scans it · They tap what's happening · It goes straight to your vendor.
- **What staff see**: 24px scan icon + H2, two paragraphs; right: two phones (report with "Frost build-up" selected and "1 photo added", rotated -3° and shifted 18px down; confirmation "Sent to Metro Refrigeration" with check circle, work-order card, `Call Metro Refrigeration` outline button, rotated 3°). Second phone hidden ≤ 1100px.
- **What you see** (owner): dashboard mock on the left (`data-visual-left`): "Sunrise Diner · 2 locations · 23 units · 1 open work order" + `Multi-kitchen` outline tag; two location rows (Downtown 14 units · 1 open in accent; Airport Rd 9 units · All clear); Vendors two-up (`data-two`, single column ≤ 560px): Metro Refrigeration card and a dashed "Cooking · no vendor yet" card; Work order #1043 progress: five dots joined by lines, three complete in accent, labels Sent 7:41 pm / Opened 7:44 pm / Ack'd 7:52 pm / ETA — / Finished —, `Acknowledged` tag. Right: kicker "For the owner", H2 "What you see", intro, four icon rows (Every location, one dashboard · Vendor contact cards · Work orders with dispatch status · A free tier you're never locked out of).
- **Plans** teaser (behind `showPricingTeaser`): kicker, H2 "Free to start, simple to grow into.", copy, ghost "Compare all plan details →" → `/pricing?for=owners`; three compact cards (name + price on one line, blurb, limits line) for Free / Kitchen (highlighted, `Most popular`) / Multi-kitchen; footnote.
- **Questions**: H2 "Questions from restaurants and kitchens.", link to `/pricing?for=owners` for billing, five owner FAQs.
- CTA: "Put a tag on your first machine today." / "Free for one location, no credit card. Add your equipment and vendors in minutes." `Start free` primary, `Talk to us first` secondary.

Flags: `showStat`, `showPricingTeaser`, `scrollReveal`.

### 5. FAQ (`FAQ.dc.html` → `/faq`)

- Hero: kicker "FAQ", H1 "Frequently asked questions.", lead with a link to `/contact`.
- Sticky jump nav (`top: 64px`, blur): `01 Product`, `02 Billing`, `03 Restaurants & kitchens` pills.
- Three groups, each a two-column block (sticky left heading at `top: 136px` on desktop): kicker `01 · Product` etc., H2, a one-line link to the related page, and the accordion. Product (6 questions) and Billing (6) are the existing `productFaqs`/`billingFaqs`; the third group is the existing `ownerFaqs` (5). The first answer in each group is open on load (`openFirst`). Group `id`s: `product`, `billing`, `restaurants`; `scroll-margin-top: 124px`.
- CTA: "Still have questions?" / "Ask us directly, or start the trial and scan your first sticker yourself." `Contact us` primary → `/contact`, `Start free trial` secondary.

Flags: `openFirst`, `showRestaurants`, `scrollReveal`.

### 6. About (`About.dc.html` → `/about`)

- Hero: kicker "About", H1 "Built on a route, not in a boardroom.", lead "EquipQR started as one technician's fix for his own dispatch problem."
- Story: left column `max-width: 62ch`, `clamp(16.5px, 1.25vw, 18px) / 1.7 / neutral-300`, paragraphs from `about/page.tsx` verbatim, with "The truck rolls that are left are the ones that actually need a truck." pulled out as the accent-bordered pull line between paragraphs 3 and 4. Right (sticky): a 4:5 photo slot (`.lighten` wrapper, 14px radius) and three fact rows with icons: Working repair technician · Commercial coffee & espresso · Dallas–Fort Worth, TX. Omit the photo block until a photo exists.
- CTA: "Running a route of your own?" / "Try EquipQR free for 14 days and see how much of your call volume a sticker can answer." `Start free trial` primary, `Get in touch` secondary.

### 7. Contact (`Contact.dc.html` → `/contact`)

- Hero: kicker "Contact", H1 "Get in touch.", lead "Questions about pricing, setting up your first guide, or ordering sticker batches. We read every message."
- Two columns. Left (sticky): `Email us directly` card linking `mailto:support@equipqr.co` (hover border → accent), `Response time` card ("Usually within one business day. Pro and Business plans get priority support."), and a 14px note linking to `/faq`. Cards: 14px radius, surface, `neutral-900` border, `padding: 18px 20px`, 22px accent icon.
- Right: form panel (16px radius, surface, `neutral-900` border, `shadow-sm`, `padding: clamp(22px, 3vw, 32px)`). Fields, gap 18px: Name + Email in a two-up grid (`data-two`, single column ≤ 560px), Company (optional), "How can we help?" textarea (`min-height: 150px`). Inputs 44px tall, 15px, Nocturne `.input`. Labels 13.5px neutral-300. Submit `Send message` primary 46px, with a 13px note "Goes to support@equipqr.co. We reply from there."
- Validation (client, on submit): all of name/email/message required → "Please fill in your name, email, and a message."; email must match a basic pattern → "That email address doesn't look right." Errors render in an inline alert (dashed-free: 10px radius, `neutral-700` border, bg color, 14px, accent warning icon, `role="alert"`). Clear the error on any change.
- Pending: button disabled, label `Sending…`. Success: the form is replaced by a status block (44px accent-tinted check circle, H2 "Thanks, we'll get back to you shortly.", copy with the support address, `Send another` secondary button that resets). Wire to the existing `actions.ts` server action; the success copy matches its message.

Flags: `simulateDelayMs` (prototype only), `scrollReveal`.

### 8. Security (`Security.dc.html` → `/security`)

- Hero: kicker "Trust", H1 "Security", lead "A summary of how EquipQR keeps your data — and your customers' data — isolated and protected."
- Two columns. Left (sticky): 16px intro "Five things that are true of every account, on every plan." and a jump list (01–05, 14.5px, 8px-radius hover tint) plus links to Privacy and Terms. Right: five rows (14px radius, surface, `neutral-900` border → `neutral-700` on hover, `padding: clamp(20px, 3vw, 26px)`, 22px accent icon, H2 18px / 500, copy 15px / 1.6 / neutral-400 / 62ch) with the exact titles and text from `security/page.tsx`: Tenant isolation by row-level security · Encrypted in transit and at rest · No card data touches our servers · Least-privilege team roles · Public pages expose only what's needed. Icons: layers, lock, card, users, shield-check.
- CTA panel: mail icon, H2 "Found a security issue?", copy with `support@equipqr.co` link and "Please don't test against other customers' accounts or data.", `Report an issue` primary (`mailto:`).

### 9. Terms (`Terms.dc.html` → `/terms`) and 10. Privacy (`Privacy.dc.html` → `/privacy`)

Shared legal layout (replaces `legal.tsx`):
- Hero: kicker "Legal", H1 (Terms of Service / Privacy Policy), lead (the existing `description`), then "Last updated September 3, 2026" in 14px neutral-500 `tnum`.
- Two columns `minmax(min(100%, 280px), 1fr)`, gap `40px clamp(32px, 5vw, 80px)`. Left (sticky, `max-width: 360px`): "Contents" label (12px uppercase) and a numbered list of section links (14px, number in accent 12px with `min-width: 16px`, 8px-radius hover tint), then a 13.5px "See also" line linking the other two trust pages.
- Right: `max-width: 68ch`, 16px / 1.7 / neutral-300, sections separated by `clamp(28px, 3vw, 40px)`, each `scroll-margin-top: 88px`. Section H2 `clamp(20px, 1.8vw, 24px)` / 500 with the number in accent as a leading flex item. Lists `padding-left: 22px; gap: 6px`. `<strong>` is weight 500 in `--color-text`. The `/e/` path renders as an inline code chip (monospace 0.9em, surface background, `neutral-900` border, radius 5px).
- Bottom notice (behind `showNotice`): 12px radius, surface, `neutral-900` border, 14px neutral-400: "**Note:** this page is a general template provided for convenience and does not constitute legal advice. Have a qualified attorney review it before relying on it for your business."
- All section text is verbatim from `terms/page.tsx` (14 sections) and `privacy/page.tsx` (11 sections).

Flags: `lastUpdated`, `showNotice`.

## Interactions & behavior (summary)

- Navigation: header links, footer links, in-page anchors (`#how-it-works`, `#plans`, jump navs) with `scroll-behavior: smooth` (off under reduced motion) and `scroll-margin-top` equal to the sticky header stack (80px, 88px, or 124px with a jump nav).
- Hover: cards border `neutral-900 → neutral-700` (.2s); links/nav text to `--color-text` or `accent-300` (.15s); pill/list hover accent border + 8% tint; FAQ summary text → `accent-300`; chevron rotate.
- Scroll reveal as described. Every `[data-reveal]` group is a section header or a card grid; never individual list items.
- Pricing: audience and interval toggles re-render cards, table, FAQ, and CTA without layout shift (cards are equal height via `align-items: stretch`).
- Contact: validation, pending, success, reset as described.
- Mobile header: hamburger toggles the panel; `aria-expanded` and a label that flips between "Open menu" / "Close menu"; closing on link click.
- Accessibility: every section has `aria-labelledby` or `aria-label`; table marks carry `aria-label`; radios are real inputs; buttons/links ≥ 36px tall (44px on mobile menu); focus ring is the accent outline; contrast: body copy never uses the raw accent (accent-300 instead).

## Responsive behavior

Breakpoints used (max-width unless noted): 1100 (second phone hides on Restaurants; Home benefits 3 → 2 cols), 1040 (Features side list hides), 880/881 (header desktop ↔ mobile), 820 (dashboard sidebar hides), 760/761 (visual-left rows stack; sticky asides un-stick), 720 (jump-nav label hides), 700 (comparison optional column hides), 640 (Home compare grid collapses), 560 (second phone on Home hides; two-up grids collapse; benefit/fact/capability grids to 1 col). Everything else reflows via `auto-fit` grids and `clamp()`.

## State management

- `SiteHeader`: `open` (mobile menu), `active` route from `usePathname()`.
- `Pricing`: `audience`, `interval`; read `?for=owners` on mount (`useSearchParams`).
- `Contact`: `form { name, email, company, message }`, `status: idle | pending | success`, `error`.
- Scroll reveal: per-page observer; no global state.
- No data fetching on any page; plan data, FAQs, and support email come from `src/lib/plans.ts`, `_components/faq-data.ts`, `src/lib/site.ts`.

## Assets

- `assets/equipqr-mark.svg`: the mark (also inlined as a `<symbol id="eq-mark">` in the HTML files). Stroke-based on `currentColor`; export a filled/flattened version for the favicon and OG image.
- `assets/logo-explorations/`: the 31 candidate marks from the exploration rounds, for reference only (the chosen one is round 9a).
- `Brand Board.dc.html`: lockups, sizes, color variants, type pairing, and "don't" examples.
- `Logos.dc.html`: the exploration board that led to the mark.
- Fonts: Inter (already in Nocturne), DM Sans 500 (Google Fonts).
- Photos / customer logos / testimonial: none exist yet; slots are placeholders.
- Icons: hand-drawn inline SVG in the design; use Lucide equivalents in the codebase.

## Files

Design references (open in a browser):
- `Home.dc.html`, `Features.dc.html`, `Pricing.dc.html`, `Restaurants.dc.html`, `FAQ.dc.html`, `About.dc.html`, `Contact.dc.html`, `Security.dc.html`, `Terms.dc.html`, `Privacy.dc.html`
- `SiteHeader.dc.html`, `SiteFooter.dc.html` (shared; imported by every page)
- `Brand Board.dc.html`, `Logos.dc.html`
- `Home v1.dc.html` (superseded first pass; for history only)
- `support.js`, `image-slot.js`: runtime for the design files; not part of the deliverable
- `_ds/nocturne-1eadabea-8ad0-4e4b-9e2c-d77f58c193d0/styles.css`: the token sheet and component classes the designs load; the source of every value in Design tokens

Each page's tweak flags live in the `data-props` JSON at the bottom of its file; the logic class right under it shows the exact state handling.

## Repo mapping

| Design file | Replaces / informs |
| --- | --- |
| `Home.dc.html` | `src/app/(marketing)/page.tsx`, `_components/phone-mock.tsx` |
| `Features.dc.html` | `src/app/(marketing)/features/page.tsx` |
| `Pricing.dc.html` | `pricing/page.tsx`, `pricing/audience-tabs.tsx`, `pricing/pricing-toggle.tsx`, `_components/pricing-cards.tsx`, `_components/owner-pricing-cards.tsx`, `src/lib/plans.ts` (rename) |
| `Restaurants.dc.html` | `restaurants/page.tsx` |
| `FAQ.dc.html` | `faq/page.tsx`, `_components/faq-item.tsx`, `_components/faq-data.ts` |
| `About.dc.html` | `about/page.tsx` |
| `Contact.dc.html` | `contact/page.tsx`, `contact/contact-form.tsx`, `contact/actions.ts` |
| `Security.dc.html` | `security/page.tsx` |
| `Terms.dc.html`, `Privacy.dc.html` | `terms/page.tsx`, `privacy/page.tsx`, `_components/legal.tsx` |
| `SiteHeader.dc.html` | `_components/site-header.tsx` |
| `SiteFooter.dc.html` | `_components/site-footer.tsx` |
| `Brand Board.dc.html`, `assets/equipqr-mark.svg` | `src/components/logo.tsx`, `src/app/icon.tsx`, `opengraph-image.tsx`, `src/lib/branding.ts`, `globals.css` tokens |

Suggested order: tokens + fonts in `globals.css` → `logo.tsx` + favicon → `site-header.tsx` / `site-footer.tsx` → shared primitives (button variants, accordion, table, segmented control, scroll-reveal wrapper) → pages in the order above.
