# EquipQR marketing site redesign — Claude Code build brief

**Repo:** `carsonthejackson-a11y/equipqr` (checked against `main` @ `b1766f3`)
**Design source of record:** `EquipQR_Branding_Redesign.zip` → `design_handoff_equipqr_marketing_site/` (Claude Design handoff, Sept 14 2026)
**Scope:** every route under `src/app/(marketing)/`, the shared header/footer, the brand mark (`logo.tsx`, favicon, OG image), and the plan rename in `src/lib/plans.ts`. Nothing under `dashboard/`, `admin/`, `(auth)/`, `e/`, `r/`, `v/`, or `api/` changes visually.

---

## 0. Kickoff prompt (paste this into Claude Code)

Before starting: unzip `EquipQR_Branding_Redesign.zip` and copy `design_handoff_equipqr_marketing_site/*` into `docs/design/marketing-2026-09/` in the repo, and save this file there as `BRIEF.md`. Then paste:

```
Read docs/design/marketing-2026-09/BRIEF.md in full, then docs/design/marketing-2026-09/README.md in full. Both are the spec; the brief wins where they differ.
Follow AGENTS.md: before writing any Next.js code, read the relevant guides in node_modules/next/dist/docs/ (App Router layouts, next/font, metadata + ImageResponse, useSearchParams/Suspense, Link).
Work on branch feat/marketing-redesign. Run WS0, then WS1–WS3 (WS2 in parallel with WS1), then WS4, then fan out WS5–WS13 as parallel subagents with the file-ownership table in §4 enforced, then WS14. One commit per workstream. Do not touch any file outside the ownership table without adding it to the table first.
```

---

## 1. What this brief adds on top of the handoff README

The handoff `README.md` is exhaustive on *what* to build (tokens, type scale, every section, every state, breakpoints, copy). Do not re-derive any of that; open the `.dc.html` files and the README when building a page. This brief covers what the README couldn't know about the repo:

1. How to scope the dark "Nocturne" theme so the dashboard, auth, and public scan pages don't turn dark (§3, D1).
2. How the design's primitives map onto shadcn v4 / Base UI components already in the repo (§3, D2–D5).
3. Blast radius of shared files (`logo.tsx` is imported in 10 places; `plans.ts` drives billing copy and Stripe mapping).
4. Design-vs-code divergences and which side wins (§3.5).
5. A parallel workstream plan with file ownership so subagents don't collide (§4).
6. The tests that will break and how to update them (§5).

---

## 2. Repo facts every subagent must know

- **Next.js 16.2.12, React 19.2, Tailwind v4 (`@tailwindcss/postcss`), shadcn v4 on `@base-ui/react`** (not Radix). `AGENTS.md` says this Next version has breaking changes vs. training data: read `node_modules/next/dist/docs/` before writing routing, font, metadata, or `ImageResponse` code.
- `src/app/globals.css` is **app-wide**. It imports `shadcn/tailwind.css`, defines the shadcn semantic vars (`--background`, `--primary`, …) in `:root` and `.dark`, and exposes them via `@theme inline`. `--radius` is `0.625rem` (10px) → `rounded-md` = 8px, `rounded-lg` = 10px, `rounded-xl` = 14px. There is a `@custom-variant dark (&:is(.dark *))`.
- Root layout (`src/app/layout.tsx`) applies Geist Sans/Mono variables to `<html>` and mounts the sonner `Toaster`. The marketing layout (`src/app/(marketing)/layout.tsx`) is just `SiteHeader` + `<main>` + `SiteFooter` in a `min-h-svh` flex column.
- `src/components/ui/button.tsx`: `cva` variants `default | outline | secondary | ghost | destructive | link`, sizes `default(h-8) | xs | sm | lg(h-9) | icon…`. Links are rendered via `render={<Link href=… />}` and the component infers `nativeButton`. Existing e2e locates CTAs by `a[href="/signup"]` + text, so keep that pattern.
- `src/components/logo.tsx` exports `Logo` and `LogoMark`. Imported by: `(auth)/layout.tsx`, `admin/layout.tsx`, `dashboard/layout.tsx`, `dashboard/locations/[id]/poster/page.tsx`, `dashboard/onboarding/owner/page.tsx`, `error.tsx`, `not-found.tsx`, `invite/[token]/page.tsx`, and the marketing header/footer. All of those are **light-background** except marketing.
- `src/app/icon.tsx` (favicon) is app-wide. `src/app/(marketing)/opengraph-image.tsx` is marketing-only. Both use `ImageResponse` from `next/og` (Satori: hex colors only, no CSS vars, no oklch; inline `<svg>` elements are supported).
- `src/lib/plans.ts` is the single source of truth for plan names/prices/limits. `plan.name` is rendered in the dashboard (`dashboard/page.tsx`, `settings/billing/*`), in limit-error strings (`lib/billing.ts`, `equipment/import/actions.ts`), and marketing. `plan.id` maps to Stripe price env vars (`STRIPE_PRICE_SITE_*`, `STRIPE_PRICE_MULTI_SITE_*`) — **ids never change**.
- `src/lib/features.ts`: `FEATURES.batchQr` (env-flag, default on) gates the "Pre-printed batch QR sticker orders" compare row in `pricing/audience-tabs.tsx`. `FEATURES.ownerAccounts` exists but is not referenced in marketing today.
- Pricing: `pricing/page.tsx` wraps `AudienceTabs` in `<Suspense fallback={<ProviderPricingSection />}>` because `useSearchParams` needs a boundary on a static page; the fallback is byte-identical to the providers tab so there's no flash. Keep that pattern. Audience is URL state (`?for=owners`), interval is `useState`.
- Contact: `contact/actions.ts` is a `"use server"` action used via `useActionState` in `contact-form.tsx`. It returns `{ status: "idle"|"success"|"error", message }`. Server validation message is exactly `"Please fill in your name, email, and a message."`. Success message is `"Thanks — we'll get back to you shortly."` (em dash; the design's H2 uses a comma — see §3.5).
- CTA hrefs that must survive the redesign (the design HTML uses `#`/placeholder links):
  - Provider plan cards → `/signup?plan=${plan.id}`; header/hero `Start free trial` → `/signup`; `Log in` → `/login`.
  - Owner plan cards → `/signup?kind=owner&plan=${plan.id}`; Restaurants `Start free` → `/signup?kind=owner`.
  - `Talk to us` / `Get in touch` / `Contact us` → `/contact`; `Compare all plan details` → `/pricing?for=owners`; `See how it works` → `#how-it-works`.
  - Security `Report an issue` → `mailto:${SUPPORT_EMAIL}`; footer email → `mailto:${SUPPORT_EMAIL}` (`SUPPORT_EMAIL` from `src/lib/site.ts`, never hard-code the address).
- CI (`.github/workflows/ci.yml`): `npm run lint` → `npx tsc --noEmit` → `npm test` (vitest, jsdom) → `npm run build` → Playwright e2e against `next start` with dummy Supabase env (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`). `next/font/google` fetches fonts at build time — CI has network; local builds need it too.
- Tests: `e2e/public.spec.ts` asserts the Home H1 contains `"truck roll"` (will break — see §5), Pricing headings `Starter/Pro/Business` and `getByText("$79")`, Restaurants H1 contains `"Tag the kitchen"` (still true). `src/components/ui/button.test.tsx`, `src/lib/plans.test.ts` (asserts ids, not names), `src/lib/branding.test.ts` (asserts `DEFAULT_BRAND_COLOR` — untouched by this brief).

---

## 3. Decisions (defaults chosen — override only if Carson says so)

### D1 — Scope the Nocturne theme to the marketing route group. Do not restyle `:root`.

The handoff says "map these onto the CSS variables in `src/app/globals.css`." Doing that globally would turn the dashboard, admin, auth, and public `/e/` scan pages dark green. Instead:

1. In `globals.css`, after the `.dark { … }` block, add a `.theme-nocturne { … }` block that (a) re-maps the shadcn semantic vars and (b) defines the full Nocturne ramp under an `--eq-*` namespace. Source of every value: handoff README "Design tokens" (accent ramp is the **green**, not Nocturne's default blurple).

   ```css
   .theme-nocturne {
     color-scheme: dark;

     /* shadcn semantic vars → Nocturne, so Button/Card/Input/Table inherit */
     --background: #161826;          --foreground: #e9e9ed;
     --card: #232532;                --card-foreground: #e9e9ed;
     --popover: #232532;             --popover-foreground: #e9e9ed;
     --primary: #3ecf8e;             --primary-foreground: #093421;
     --secondary: #232532;           --secondary-foreground: #e9e9ed;
     --muted: #232532;               --muted-foreground: #9397ab;
     --accent: #232532;              --accent-foreground: #e9e9ed;
     --border: #292b31;              --input: #3f424d;
     --ring: #3ecf8e;

     /* Nocturne ramp (README "Design tokens") */
     --eq-bg: #161826; --eq-surface: #232532; --eq-text: #e9e9ed;
     --eq-divider: color-mix(in srgb, #e9e9ed 16%, transparent);
     --eq-neutral-100: #f3f5fe; --eq-neutral-200: #e4e7f5; --eq-neutral-300: #cfd3e5;
     --eq-neutral-400: #b2b6ca; --eq-neutral-500: #9397ab; --eq-neutral-600: #75798c;
     --eq-neutral-700: #595d6c; --eq-neutral-800: #3f424d; --eq-neutral-900: #292b31;
     --eq-accent: #3ecf8e;
     --eq-accent-100: #ecf9f1; --eq-accent-200: #d2f1de; --eq-accent-300: #a7e5c2;
     --eq-accent-400: #56d396; --eq-accent-500: #3ecf8e; --eq-accent-600: #05915e;
     --eq-accent-700: #007047; --eq-accent-800: #045032; --eq-accent-900: #093421;
     --eq-accent-tint-8:  color-mix(in srgb, var(--eq-accent) 8%, transparent);
     --eq-accent-tint-9:  color-mix(in srgb, var(--eq-accent) 9%, transparent);
     --eq-accent-tint-12: color-mix(in srgb, var(--eq-accent) 12%, transparent);
     --eq-accent-tint-16: color-mix(in srgb, var(--eq-accent) 16%, transparent);
     --eq-bezel: #0d0f18;
     --eq-shadow-sm: 0 0 0 1px #3f424d;
     --eq-shadow-md: 0 0 0 1px #595d6c, 0 6px 18px rgba(0,0,0,0.55);
   }
   ```

2. Expose the ramp as Tailwind utilities by adding to the existing `@theme inline` block: `--color-eq-bg: var(--eq-bg)`, `--color-eq-surface`, `--color-eq-text`, `--color-eq-divider`, `--color-eq-neutral-100…900`, `--color-eq-accent`, `--color-eq-accent-100…900`, `--color-eq-accent-tint-8/9/12/16`, `--color-eq-bezel`, `--shadow-eq-sm`, `--shadow-eq-md`. Then `text-eq-neutral-400`, `border-eq-neutral-900`, `bg-eq-accent-tint-8`, `shadow-eq-md` all work and resolve to the scoped variables at runtime.

3. Marketing layout root: `<div className={cn("dark theme-nocturne", inter.variable, dmSans.variable, "flex min-h-svh flex-col font-[family-name:var(--font-inter)] text-pretty text-eq-text")}>` with the page-root radial-gradient background from README "Backgrounds" applied here (as a `bg-[image:…]` arbitrary value or a small `.eq-page-ground` class in `globals.css`). Adding `dark` alongside `theme-nocturne` activates shadcn's `dark:` refinements (disabled/invalid states, `dark:bg-input/30`) — place `.theme-nocturne` **after** `.dark` in the file so its variables win.

4. `html` cannot be reached from the layout; put `html:has(.theme-nocturne) { scroll-behavior: smooth }` inside `@media (prefers-reduced-motion: no-preference)` in `globals.css`.

5. Do **not** change `--radius`. Use `rounded-md` (8px: buttons, inputs, chips), `rounded-[10px]` (segmented control, phone tiles, contact info cards), `rounded-xl` (14px: cards, table frame, legal notice is 12px → `rounded-[12px]`), `rounded-2xl` is 18px so use `rounded-[16px]` (contact form panel) and `rounded-[20px]` (CTA panel), `rounded-full` (chips/pills/tags).

Promotion of this theme to the whole app is a later, separate workstream (move the block to `:root`, then re-audit the dashboard). Not in scope.

### D2 — Fonts: Inter + DM Sans via `next/font/google`, scoped to the marketing layout.

Load `Inter({ subsets:["latin"], weight:["400","500"], variable:"--font-inter" })` and `DM_Sans({ subsets:["latin"], weight:["500"], variable:"--font-dm-sans" })` in `src/app/(marketing)/layout.tsx`, apply both `.variable` classes on the theme root, set Inter as the root's font-family, and use DM Sans **only** on the wordmark span (`font-[family-name:var(--font-dm-sans)] font-medium tracking-[-0.02em] leading-none`). Geist stays on `<html>` for the rest of the app. Never use a weight above 500 in marketing (README "Typography"). Verify the exact `next/font/google` API in `node_modules/next/dist/docs/` first.

### D3 — Replace `logo.tsx` app-wide, keep its API.

New `src/components/logo.tsx` keeps the exports `LogoMark({ className })` and `Logo({ className })` so the 10 import sites compile unchanged, but:

- `LogoMark` renders the "Scan Q, arrow" SVG inline (geometry in §6; also `docs/design/marketing-2026-09/assets/equipqr-mark.svg` — strip its `<metadata>` block). `stroke="currentColor"`, `fill="none"`, `stroke-linecap="square"`, `stroke-linejoin="miter"`, `aria-hidden`. No background tile, no rounded box. Default size `size-6` (24px) — the Brand Board's minimum on screen; callers pass `className` to resize (header 26px, footer 24px, About teaser 40px).
- Color is `currentColor`; `LogoMark` itself sets **no** color. Wrap-site rule: on the marketing (dark) pages the parent sets `text-eq-accent`; on light app pages the existing call sites get `text-primary` (teal) via a default `className="text-primary"` on `Logo`'s mark, which the marketing header/footer override. Brand Board: brand-on-ground for dark, mono for light/print; the raw `#3ecf8e` fails contrast as *text* on white, so never use it for the wordmark on light pages.
- `Logo` wordmark: `EquipQR`, DM Sans 500 on marketing; on app pages the DM Sans variable isn't loaded, so fall back to `font-heading font-medium` (Geist) — acceptable until the app-wide brand rollout.
- Below 24px (e.g. the 18px dashboard-mock sidebar on Home) use the simplified `#eqs` symbol from `Brand Board.dc.html` ("16 · solid arrow" variant). Add it as `LogoMarkSmall` if needed.
- Don'ts (Brand Board): no rotation, no stretch, no glow/shadow, no rounded caps, no all-caps/bold wordmark.

### D4 — Plan rename: `site` → "Kitchen", `multi_site` → "Multi-kitchen".

In `src/lib/plans.ts` change only display fields for those two plans (ids, prices, limits, features unchanged):

- `site.name: "Kitchen"`, `site.blurb: "For one kitchen that wants AI troubleshooting and pre-printed QR batches."`
- `multi_site.name: "Multi-kitchen"`, `multi_site.blurb: "For an owner running several kitchens who wants branding across all of them."`, `multi_site.highlights[3]: "Everything in Kitchen"`
- `free.blurb: "For one site tracking equipment and taking service requests, at no cost."` stays (README lists it verbatim).
- `src/app/(marketing)/_components/faq-data.ts` line ~77: "…Site and Multi-site add more equipment…" → "…Kitchen and Multi-kitchen add more equipment…".
- `src/lib/vocab.ts` `siteSingular: "Site"` is the *location* vocabulary, not a plan name — **do not touch**.
- Side effects to accept: dashboard billing pages and limit-error strings now say "Kitchen"/"Multi-kitchen" (desired). Add a note to the PR: rename the matching Stripe **product** names in the Stripe dashboard (test + live) so Checkout matches; `docs/BILLING.md` and `docs/OWNER-ROADMAP-BRIEF.md` mention the old names — update the display names, leave ids.

### D5 — Primitives: extend, don't fork.

- **Button.** Add variants to `src/components/ui/button.tsx` (additive; nothing existing changes): `brand` = `border-primary text-primary bg-transparent hover:bg-eq-accent-tint-12 active:bg-eq-accent-tint-16 active:text-eq-accent-400`; `neutral` = `border-eq-neutral-700 text-foreground bg-transparent hover:bg-foreground/10`. Add size `xl` = `h-11 px-4 text-[15px] gap-2` (44px page CTAs; the CTA-panel/contact submit at 46px use `h-[46px]`). Header buttons use existing `size="lg"` (36px). Ghost links ("All features →") = `variant="ghost"` with `text-primary`. Focus ring: keep the component's `focus-visible:` classes; in the theme scope `--ring` is the accent, which yields the README's accent outline. Run `button.test.tsx`.
- **Card.** Use `Card` from `ui/card.tsx` only where its `ring-1 ring-foreground/10 rounded-xl bg-card` default is close (plan cards, step cards); pass `className="ring-0 border border-eq-neutral-900 hover:border-eq-neutral-700 transition-colors duration-200 p-[clamp(22px,3vw,28px)]"`. For mocks and rows a plain `div` is fine — don't force `Card`.
- **Accordion.** Keep `faq-item.tsx`'s native `<details>/<summary>` (no Base UI needed); restyle to README "Accordion" (no card border per row; `border-t border-eq-neutral-800`, last row also bottom; summary 16px/500 `py-[18px]`, hover `text-eq-accent-300`; chevron `rotate-180` when open; answer 15px `text-eq-neutral-400 max-w-[60ch]`). Add an `open?: boolean` prop for FAQ page `openFirst`.
- **Segmented control.** Keep the Base UI `Tabs` for audience (it is URL-synced and a real tablist) and the existing `role="radiogroup"` buttons for interval; restyle both to README "Segmented control" (`bg-eq-surface rounded-[10px]`, options 40px tall `px-4 text-sm font-medium`, checked = accent outline via `shadow-[inset_0_0_0_1px_var(--eq-accent)] text-primary`). The `2 months free` tag sits inside the Yearly option.
- **Table.** Keep `ui/table.tsx`; wrap in `rounded-xl border border-eq-neutral-900 overflow-x-auto` with `min-w-[640px]` on the table; cell styles per README "Table". Check = 18px `text-primary` with `aria-label="Included"`; X = 18px `text-eq-neutral-700` with `aria-label="Not included"`.
- **Icons.** Lucide (`lucide-react` ^1.27). Create `src/app/(marketing)/_components/icon.tsx` that wraps any Lucide icon with `strokeWidth={1.75} strokeLinecap="square" strokeLinejoin="miter"` (checks `strokeWidth={2}`) so every marketing icon matches the design's square-cap language. Sizes: 16 inline, 18 table marks, 22 feature-row leaders, 24 section leads.
- **New shared marketing components** (all in `src/app/(marketing)/_components/`, created in WS3): `container.tsx`, `section.tsx` (padding rhythm + optional faded divider), `kicker.tsx`, `reveal.tsx` (client), `tag.tsx`, `jump-nav.tsx` (sticky pill nav for Features/FAQ), `cta-panel.tsx`, `phone-mock.tsx` (rebuild), `dashboard-mock.tsx`, `compare-table.tsx`, `plan-card.tsx`, `feature-row.tsx`, `icon-row.tsx`, `legal.tsx` (rewrite).

### D6 — Scroll reveal must not hide server-rendered content.

`reveal.tsx` is a `"use client"` component. On the server it renders children fully visible. In an effect it (a) returns early under `prefers-reduced-motion: reduce` or when `enabled={false}`, (b) marks the element hidden only if its top is below 92% of the viewport, (c) observes with `IntersectionObserver({ threshold: 0.12, rootMargin: "0 0 -6% 0" })`, (d) sets visible once. CSS: `[data-reveal="hidden"] { opacity:0; transform:translateY(14px) }` and `[data-reveal] { transition: opacity .7s cubic-bezier(.2,.7,.2,1), transform .7s cubic-bezier(.2,.7,.2,1) }`, both inside `@media (prefers-reduced-motion: no-preference)`. Wrap **section headers and card grids only**, never individual list items. Hero phone gets `delayMs={120}`.

### D7 — Placeholders ship omitted.

Per README "Fidelity": `showSocialProof` = **false** on Home; the Home quote section is not rendered; the About photo block is not rendered; the tag mock's "Your logo" slot renders as the dashed empty slot the design shows. `showStat` on Restaurants stays **on** (the MachineQ figure has a source line). Keep the flags as props/consts so they can be flipped later.

### D8 — Handoff files live in the repo at `docs/design/marketing-2026-09/`.

Trim what was copied in §0 and commit it: `README.md`, this `BRIEF.md`, all `*.dc.html` **except** `Home v1.dc.html` and `Logos.dc.html`, `_ds/**/styles.css`, `assets/equipqr-mark.svg` (metadata stripped), `support.js` and `image-slot.js` (the pages won't open without them). Skip `assets/logo-explorations/`. ESLint only targets JS/TS so the HTML is inert; `support.js`/`image-slot.js` are plain JS — if `npm run lint` picks them up, add `docs/design/**` to `globalIgnores` in `eslint.config.mjs`.

### 3.5 Design-vs-code divergences — which side wins

| Item | Design | Code today | Ship |
|---|---|---|---|
| Header nav order/labels | Features, Pricing, Restaurants, FAQ | Features, Pricing, FAQ, "For restaurants" | **Design** |
| Footer Product column | Features, Pricing, For restaurants, FAQ, Security | no restaurants link | **Design** |
| Compare row "Pre-printed batch QR sticker orders" | always shown | gated by `FEATURES.batchQr` | **Code** — keep the gate (also gate the matching plan-card highlight and Features matrix row) |
| Compare row label | "Your logo & colors on customer pages" | "Custom branding on customer pages" | **Design** |
| Pricing hero lead | "…Hit a limit and you get an upgrade prompt, not an overage fee." | different wording | **Design**, but keep `{TRIAL_DAYS}` interpolated |
| Owner FAQ heading on Pricing | "Questions from restaurants and kitchens." | "…restaurants & small business" | **Design** |
| Contact success H2 | "Thanks, we'll get back to you shortly." | action returns "Thanks — we'll get back to you shortly." | Render `state.message` from the action; change the action string to the design's comma version so both match |
| Contact client validation | required + email pattern, inline `role="alert"` | server-only | **Both**: client pre-check with the same strings, server stays authoritative |
| Buttons | outlined, never filled | filled teal `default` | **Design** — marketing uses `brand`/`neutral`/`ghost` variants only; never `variant="default"` on a marketing page |
| Plan CTA hrefs | `#` | `/signup?plan=…` etc. | **Code** (see §2) |
| Restaurants "Start free" small print | "Free forever for one location · no credit card" | similar | **Design** |

---

## 4. Workstreams, order, and file ownership

Run WS0 alone. WS1 and WS2 can run in parallel (disjoint files). WS3 needs WS1. WS4 needs WS1–WS3. WS5–WS13 fan out in parallel after WS4 lands; each owns only its route folder plus the files listed. WS14 last.

**Rule for subagents:** a subagent may create/edit only files in its "Owns" list. If it needs a change elsewhere (e.g. a new prop on a shared primitive), it writes the request into `docs/design/marketing-2026-09/HANDOFF-NOTES.md` under its WS heading and the orchestrator applies it. Every subagent gets: this brief, the README, and its page's `.dc.html` (+ `SiteHeader.dc.html`/`SiteFooter.dc.html` for context).

To read copy without retyping it, dump a page's text once: `python3 -c "import re,html,sys;s=open(sys.argv[1],encoding='utf-8').read();s=re.sub(r'<(script|style|svg).*?</\1>','',s,flags=re.S);print(html.unescape(re.sub(r'\n\s*\n+','\n',re.sub(r'<[^>]+>','\n',s))))" "docs/design/marketing-2026-09/Home.dc.html"`. Copy is verbatim — no paraphrasing, no "improving".

### WS0 — Setup (orchestrator)
- Branch `feat/marketing-redesign`. Commit the trimmed handoff to `docs/design/marketing-2026-09/` (D8).
- Read `AGENTS.md` and the Next docs in `node_modules/next/dist/docs/` for: App Router layouts/route groups, `next/font/google`, `metadata` + `opengraph-image`/`icon` file conventions and `ImageResponse`, `useSearchParams` + Suspense, `Link`.
- Baseline: `npm ci && npm run lint && npx tsc --noEmit && npm test && npm run build` must be green before any change (with the three `NEXT_PUBLIC_*` env vars from `ci.yml` exported).
- Create `docs/design/marketing-2026-09/HANDOFF-NOTES.md` with one heading per WS.

### WS1 — Theme scope, tokens, fonts, layout root
**Owns:** `src/app/globals.css`, `src/app/(marketing)/layout.tsx`
- Implement D1 (all five steps) and D2.
- Add global marketing utilities to `globals.css` under the theme scope: `.eq-page-ground` (README "Backgrounds" page root), `.eq-rule` (faded divider gradient), `[data-reveal]` CSS from D6, `.eq-kicker` if a class is simpler than a component.
- `<main>` stays; header/footer stay imported here (WS4 replaces their internals).
- **Done when:** `/` renders dark with the green accent and Inter; `/dashboard` and `/login` are unchanged (compare screenshots); `npm run build` passes.

### WS2 — Brand: mark, favicon, OG image
**Owns:** `src/components/logo.tsx`, `src/app/icon.tsx`, `src/app/(marketing)/opengraph-image.tsx`, `public/brand/equipqr-mark.svg`
- Implement D3. Export `MARK_PATHS` (the geometry) from `logo.tsx` so `icon.tsx` and `opengraph-image.tsx` can reuse it as inline SVG in Satori with hex colors.
- `icon.tsx` (32×32): mark only, `#3ecf8e` strokes on `#161826`, radius 7. Since 32px is above the 24px minimum, use the full mark; make the strokes proportionally heavier if a 32px render looks thin (check the Brand Board's 24/16 sizes).
- `opengraph-image.tsx` (1200×630): Nocturne ground (`#161826`) with the accent-900 radial glow top-right (mirror the README page-root gradient in hex/rgba), mark (84px, `#3ecf8e`) + wordmark "EquipQR" (`#e9e9ed`, weight 500 — load DM Sans via a fetched font buffer if Satori supports it in this Next version; otherwise system sans), headline = Home H1 "Scan the tag. Fix it, or file the request." in `#e9e9ed` weight 500, sub-line = `SITE_DESCRIPTION` in `#b2b6ca`. Update `alt` to match the headline. Keep the file's existing exports (`size`, `contentType`).
- Check all 10 `Logo`/`LogoMark` call sites visually on light pages (`/login`, `/dashboard`, `/admin`, not-found, error, invite, poster page). Mark should be teal (`text-primary`) there, wordmark in foreground color. Fix any site that relied on the old 32px filled tile for layout (e.g. `size-8` spacing).
- **Done when:** favicon and `/opengraph-image` render (hit them in the browser after `next build && next start`); no call site regresses.

### WS3 — Shared marketing primitives
**Owns:** `src/components/ui/button.tsx` (additive only), everything in `src/app/(marketing)/_components/` **except** `site-header.tsx`, `site-footer.tsx`, `faq-data.ts`, `legal.tsx`, `owner-pricing-cards.tsx`, `pricing-cards.tsx` (those belong to later WSs)
- Implement D5 and D6. Components: `container.tsx`, `section.tsx`, `kicker.tsx`, `reveal.tsx`, `tag.tsx`, `jump-nav.tsx`, `cta-panel.tsx`, `phone-mock.tsx` (rebuild to README "Phone mock" — props for title, unit line, symptom chips + selected index, photo row, urgency line, primary label; a `variant="confirmation"` for the "Sent to …" screen), `dashboard-mock.tsx` (Home §4 and Restaurants "What you see" share the frame; props for sidebar on/off and rows), `compare-table.tsx` (rows + plans in; used by Pricing and the Features "Plans" matrix), `plan-card.tsx` (highlighted prop, price block with `tabular-nums`, feature list `flex-1`, CTA slot), `feature-row.tsx` (copy + mock, `visualLeft` prop, plan-availability tag), `icon-row.tsx`, `icon.tsx` (Lucide wrapper), restyled `faq-item.tsx`.
- Every primitive has a Storybook-free smoke check: a temporary `/(marketing)/_dev/primitives/page.tsx` that renders each one (delete before the PR; do not commit it).
- **Done when:** primitives match the README component specs at 380px, 760px, 1100px, 1440px widths; `button.test.tsx` and `tsc` pass.

### WS4 — Header + footer
**Owns:** `src/app/(marketing)/_components/site-header.tsx`, `src/app/(marketing)/_components/site-footer.tsx`
- Rebuild to README "SiteHeader" / "SiteFooter" and `SiteHeader.dc.html` / `SiteFooter.dc.html`. Nav: Features, Pricing, Restaurants, FAQ (labels exactly). Active = `usePathname()` match with `aria-current="page"`; note `/pricing?for=owners` still matches `/pricing`. Mobile breakpoint is **880px** (not Tailwind `md`); use `max-[880px]:` / `min-[881px]:` variants. Menu button 44×44, `aria-expanded`, label toggles "Open menu"/"Close menu", closes on link click. Buttons: `Log in` `variant="neutral" size="lg"`, `Start free trial` `variant="brand" size="lg"`.
- Footer: brand column (mark 24px accent + wordmark 18px), description sentence and columns verbatim from the design, `SUPPORT_EMAIL`, faded divider, `© {year} EquipQR. All rights reserved.` (keep dynamic year) / "Built by a working repair technician in Dallas–Fort Worth."
- **Done when:** header is 64px, blurred, sticky; e2e `a[href="/signup"]` + `a[href="/login"]` locators still resolve; keyboard tab order is logo → links → buttons → menu button.

### WS5 — Home (`/`)
**Owns:** `src/app/(marketing)/page.tsx`
- Build the 13 sections in README §"1. Home" from `Home.dc.html`, omitting Social proof (D7) and Quote. `showSocialProof` as a module const set to `false`. Hero H1 exactly "Scan the tag." / "Fix it, or file the request." on two lines (`<br />` or two spans). The FAQ block uses a 5-item subset of `productFaqs` (pick the ones the design shows, in order). "How it works" section `id="how-it-works" scroll-mt-20`. Home compare grid (`data-compare`) is a CSS grid, not a `<table>`.
- Update `metadata` title/description to the new positioning if the design's hero copy warrants; keep `SITE_DESCRIPTION` as the OG description.

### WS6 — Features (`/features`)
**Owns:** `src/app/(marketing)/features/page.tsx`, `src/app/(marketing)/features/*` (new files allowed)
- Three Outcome sections with alternating `FeatureRow`s and static mocks (README §"2. Features"); sticky `JumpNav` at `top-16 z-40`; `data-subnav-aside` sticky list hidden `max-[1040px]:hidden`; Plans matrix via `CompareTable` for both audiences with names from `plans.ts` (so "Kitchen"/"Multi-kitchen" flow through). Gate the batch-QR row on `FEATURES.batchQr`.

### WS7 — Pricing (`/pricing`)
**Owns:** `src/app/(marketing)/pricing/*`, `src/app/(marketing)/_components/pricing-cards.tsx`, `src/app/(marketing)/_components/owner-pricing-cards.tsx`, `src/lib/plans.ts`, `src/app/(marketing)/_components/faq-data.ts`
- Implement D4 first (small, isolated commit).
- Rebuild per README §"3. Pricing". Keep the `Suspense` + byte-identical fallback pattern and the `?for=owners` URL state; move the interval state up so the compare-table header ("Monthly, billed monthly" / "Yearly, billed annually") and the cards share it. Price block: numeral in its own element (`<span className="tabular-nums">$79</span>` then `<span>/mo</span>`) so e2e `getByText("$79")` keeps matching; yearly sub-line "Works out to $N/mo, billed annually" where N = `priceYearly / 12` rounded. Footnotes and CTA panel differ per audience — copy from the design file's two variants.
- `faq-data.ts`: only the D4 wording change; the FAQ arrays are consumed by Home, Pricing, Restaurants, FAQ — do not reorder.

### WS8 — Restaurants (`/restaurants`)
**Owns:** `src/app/(marketing)/restaurants/page.tsx`
- README §"4. Restaurants". Two phones (second hidden `max-[1100px]:hidden`), timeline card, stat band (`showStat` const = true), four step cards, owner dashboard mock via `DashboardMock` with `visualLeft`, plans teaser reading `ownerPlans` (`showPricingTeaser` = true), owner FAQs, CTA. All CTAs → `/signup?kind=owner`.

### WS9 — FAQ (`/faq`)
**Owns:** `src/app/(marketing)/faq/page.tsx`
- README §"5. FAQ". Groups `product` / `billing` / `restaurants` with `scroll-mt-[124px]`, sticky left headings `top-[136px]` on ≥761px, `JumpNav` pills, first item of each group `open` (`openFirst`), third group behind `showRestaurants` (true).

### WS10 — About (`/about`)
**Owns:** `src/app/(marketing)/about/page.tsx`
- README §"6. About". Story paragraphs are already in this file — keep them verbatim, insert the pull line between paragraphs 3 and 4, three fact rows with icons, photo block omitted (D7), CTA.

### WS11 — Contact (`/contact`)
**Owns:** `src/app/(marketing)/contact/*`
- README §"7. Contact". Keep `useActionState` + `submitContactForm`. Add client validation before calling the action (same strings), inline `role="alert"` error box, pending label "Sending…", success block replacing the form with `Send another` reset (a `key` bump or local `status` state). Change the action's success string to "Thanks, we'll get back to you shortly." (§3.5). Inputs 44px: pass `className="h-11 text-[15px]"` to `Input`/`Textarea`. Two-up name/email grid collapses `max-[560px]:grid-cols-1`.

### WS12 — Security (`/security`)
**Owns:** `src/app/(marketing)/security/page.tsx`
- README §"8. Security". Five rows with the existing titles/text verbatim, sticky left jump list, icons (Lucide `Layers`, `Lock`, `CreditCard`, `Users`, `ShieldCheck` through the WS3 wrapper), CTA with `mailto:${SUPPORT_EMAIL}`.

### WS13 — Legal (`/terms`, `/privacy`)
**Owns:** `src/app/(marketing)/_components/legal.tsx`, `src/app/(marketing)/terms/page.tsx`, `src/app/(marketing)/privacy/page.tsx`
- Rewrite `legal.tsx` as a `LegalLayout` that takes `{ title, description, lastUpdated, sections: { id, title, body }[] , showNotice }` and renders README §"9./10." (numbered sticky contents, accent numbers, `scroll-mt-[88px]`, inline `/e/` code chip, "See also" links, bottom notice). Refactor the two pages' existing 14/11 sections into that `sections` array **without changing a word**. `lastUpdated` = "September 3, 2026".

### WS14 — Tests, QA, PR
**Owns:** `e2e/public.spec.ts`, `docs/design/marketing-2026-09/HANDOFF-NOTES.md`, PR description
- Apply §5. Run the full CI sequence locally, then a manual pass per §7 at 380 / 560 / 760 / 880 / 1100 / 1440px in Chromium. Delete `_dev/primitives`. Open the PR with: summary, D1–D8 as accepted decisions, the Stripe product-rename reminder, and before/after screenshots of every route.

---

## 5. Tests that will break — required updates

| Test | Why | Change |
|---|---|---|
| `e2e/public.spec.ts` "/ renders the landing page" | H1 no longer contains "truck roll" | `toContainText("Scan the tag")` |
| `e2e/public.spec.ts` "/pricing lists all three plans" | still passes if plan names are `<h3>` headings and `$79` is its own text node | keep names as heading elements; keep numeral isolated (WS7) |
| `e2e/public.spec.ts` "/restaurants" | H1 still starts "Tag the kitchen." | no change |
| `src/components/ui/button.test.tsx` | new variants are additive | should pass; run it |
| `src/lib/plans.test.ts` | asserts ids only | no change; run it |
| **Add** e2e: `/pricing?for=owners` shows headings `Free`, `Kitchen`, `Multi-kitchen` | locks in D4 | new test |
| **Add** e2e: header mobile menu toggles at 375px viewport (`aria-expanded` flips, links visible) | locks in WS4 | new test |
| **Add** vitest: `reveal.tsx` renders children visible on the server (no `data-reveal="hidden"` in `renderToString`) | locks in D6 | new test |

---

## 6. The mark (for `logo.tsx`, `icon.tsx`, `opengraph-image.tsx`)

`viewBox="0 0 100 100"`, `fill="none"`, `stroke="currentColor"`, `stroke-width="9"`, `stroke-linecap="square"`, `stroke-linejoin="miter"`:

```svg
<path d="M14 36V14h22M56 14h22v22M14 56v22h22"/>
<rect x="31" y="31" width="30" height="30" stroke-width="7"/>
<rect x="40" y="40" width="12" height="12" fill="currentColor" stroke="none"/>
<line x1="74" y1="74" x2="84" y2="84"/>
<path d="M72 88h16V72"/>
```

Clear space ≥ 14 units on all sides. Minimum 24px on screen; below that use the Brand Board's solid-arrow variant (`<symbol id="eqs">` in `Brand Board.dc.html`).

---

## 7. Manual QA checklist (WS14)

- Every route: dark ground with the top-right green glow, faded section rules (never a solid full-width hairline), headings weight 500 everywhere (grep the marketing tree for `font-semibold`/`font-bold` → must be zero hits), body copy never in raw `#3ecf8e` (use accent-300).
- Header: 64px, blur, active link accent + `aria-current`; at ≤880px the hamburger panel works and closes on navigation.
- Home: hero phone rotated 2° with reveal delay; benefits 3 → 2 → 1 columns at 1100/560; compare grid collapses at 640; no social-proof or quote sections rendered.
- Pricing: toggling audience/interval causes no layout shift (cards `align-items: stretch`); `?for=owners` deep link lands on the owner tab; table scrolls horizontally on narrow screens; owner plans read "Kitchen"/"Multi-kitchen"; provider yearly Pro shows "$790/yr · Works out to $66/mo, billed annually".
- Restaurants: second phone hidden ≤1100; dashboard mock stacks under copy ≤760; all CTAs go to `/signup?kind=owner`.
- FAQ: jump nav sticks under the header; first answer per group open; anchors land with the group heading visible (scroll margin 124px).
- Contact: submit empty → inline alert; bad email → inline alert; valid → "Sending…" → success block → "Send another" resets.
- Legal: contents links scroll to the numbered section; `/e/` renders as a code chip; notice at the bottom.
- Reduced motion (DevTools "emulate prefers-reduced-motion"): no reveal animations, no smooth scroll.
- Lighthouse (mobile) on `/`, `/pricing`, `/restaurants`: Accessibility ≥ 95, no contrast failures; Performance not worse than `main`.
- Light-theme regressions: `/login`, `/signup`, `/dashboard`, `/admin`, `/e/<token>`, `/invite/<token>`, `/not-a-route` — visually unchanged except the new logo mark.

---

## 8. Out of scope (log in HANDOFF-NOTES.md, do not do now)

- Promoting the Nocturne theme app-wide (dashboard, auth, admin).
- Re-branding customer-facing surfaces: `DEFAULT_BRAND_COLOR` in `src/lib/branding.ts`, `BRAND_COLOR` in `src/lib/email/layout.ts`, the teal in `vendor-dispatch.ts`, and the `#0d9488` default/placeholder in `dashboard/settings/branding/*`. If/when done, use `#05915e` (accent-600) — not `#3ecf8e` — for fills that carry white text, and update `branding.test.ts`.
- Real customer logos, testimonial, About photo — flip `showSocialProof`, add the quote section, and add the photo block when assets exist.
- Stripe product display-name rename (manual, in the Stripe dashboard).
- Root `layout.tsx` title template wording ("QR troubleshooting & service requests for field service teams") — revisit after the new positioning is approved.
