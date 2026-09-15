# Handoff notes — marketing redesign (Sept 2026)

Working notes for the `feat/marketing-redesign` build. One heading per workstream
(BRIEF.md §4). Subagents record requests for files outside their ownership here;
the orchestrator applies them. Out-of-scope items (BRIEF.md §8) are logged at the
bottom.

## WS0 — Setup

- Ownership-table addition: `eslint.config.mjs` (WS0). `npm run lint` picked up
  `support.js`/`image-slot.js` in this folder (2 errors, 11 warnings), so
  `docs/design/**` is now in `globalIgnores`, as D8 allows.
- Baseline on `main@b1766f3` + this folder: lint, `tsc --noEmit`, vitest (34 files,
  456 tests) and `next build` all green with the three `NEXT_PUBLIC_*` vars from
  `ci.yml`.
- Next.js guides read for this build: `01-getting-started/03-layouts-and-pages.md`,
  `04-linking-and-navigating.md` (via `link.md`), `13-fonts.md` + `components/font.md`,
  `14-metadata-and-og-images.md`, `functions/image-response.md`,
  `file-conventions/metadata/opengraph-image.md`, `app-icons.md`,
  `functions/use-search-params.md`.

## WS1 — Theme scope, tokens, fonts, layout root

## WS2 — Brand: mark, favicon, OG image

- Details in `notes/ws2.md`. `logo.tsx` keeps `Logo`/`LogoMark` and adds
  `MarkSvg`, `MARK_PATHS`, `MARK_PATHS_SMALL`, `LogoMarkSmall`, `WORDMARK_CLASS`
  and `Logo`'s `markClassName`/`wordmarkClassName` props.
- Ownership-table addition: `src/app/dashboard/layout.tsx` (WS2, orchestrator-applied)
  — the two `LogoMark` uses gained `text-primary` because the mark no longer
  carries a colour of its own.
- Favicon strokes run 11/9 heavier than the spec so the mark survives 16px.
- OG fonts (DM Sans 500, Inter 400/500) are fetched from Google Fonts at build
  time with an offline fallback to Satori's bundled sans.
- Header/footer lockup changes requested by WS2 are carried into WS4.

## WS3 — Shared marketing primitives

- API reference for every primitive is in `notes/ws3.md`; page workstreams
  build from it.
- `button.tsx` gained `brand`/`neutral` variants and the `xl` size, additive only.
- `phone-mock.tsx` keeps the old `PhoneFrame`/`ScanScreen`/`GuideScreen`/
  `RequestScreen` names as deprecated shims until WS5/WS6 stop importing them;
  remove the shims once both pages land.
- Next treats `_dev` as a private folder, so the smoke page is viewed by copying
  it to `%5Fdev` temporarily (see `notes/ws3.md`). It is git-excluded locally.
- Home's "How it works" rows are not `StepCard`s (48px numbers with a mock per
  step); WS5 composes them from `FeatureRow`/plain markup.

## WS4 — Header + footer

- Details in `notes/ws4.md`. Nav is Features / Pricing / Restaurants / FAQ; active
  link = pathname match (query ignored) with `aria-current="page"`; mobile panel
  below 880px closes on link click and on route change.
- Footer Product column gained "For restaurants" (§3.5, design wins).

## WS5 — Home

- Details in `notes/ws5.md`. Social proof and quote sections omitted (D7);
  `showSocialProof = false` kept as a module const. Requests for `tag-mock.tsx`
  (size prop) and `feature-list.tsx` (check size) are worked around locally.

## WS6 — Features

- Details in `notes/ws6.md`. Mocks the primitives don't cover live in
  `features/mocks.tsx`; the plans matrix in `features/plans-matrix.tsx` reads the
  shared compare rows so the batch-QR gate and plan names flow through.

## WS7 — Pricing

- Details in `notes/ws7.md`. D4 rename applied in `plans.ts` and the owner FAQ
  wording. `pricing-toggle.tsx`, `pricing-cards.tsx` and `owner-pricing-cards.tsx`
  are deleted; `PlanCard` replaces them everywhere.
- PR note: rename the Stripe product display names for `site` / `multi_site` to
  "Kitchen" / "Multi-kitchen" (test + live). `docs/BILLING.md` and
  `docs/OWNER-ROADMAP-BRIEF.md` still use the old display names.

## WS8 — Restaurants

- Details in `notes/ws8.md`. `showStat` and `showPricingTeaser` on. Tailwind's
  `max-[N]` is exclusive, so the README's "≤ 1100px" hides the second phone
  below 1100px; kept as the brief names `max-[1100px]:hidden`.

## WS9 — FAQ

- Details in `notes/ws9.md`. Groups product/billing/restaurants with sticky
  headings, jump nav, first answer open per group.
- Decided divergence: the design's FAQ answers differ in places from
  `faq-data.ts` (dashes vs commas, "Every plan" vs "Every owner plan", a
  "Get in touch" link in the last billing answer). BRIEF §4 WS7 limits the shared
  FAQ data to the D4 rename, so the code strings stay; revisit if the design
  answers should win site-wide.

## WS10 — About

- Details in `notes/ws10.md`. Story paragraphs are the existing page's text
  (README: verbatim from `about/page.tsx`); the pull line moved out of paragraph 4
  into its own accent-bordered line. Photo block omitted behind `showPhoto`.

## WS11 — Contact

- Details in `notes/ws11.md`. The agent building this page was cut off before
  reporting; the orchestrator finished verification and moved
  `initialContactState` out of the `"use server"` module (it broke every submit).

## WS12 — Security

- Details in `notes/ws12.md`. Five rows keep the previous page's titles and text
  verbatim; sticky jump list on the left; the "Report an issue" CTA is a
  `mailto:` anchor, composed locally because `CtaPanel` only renders `Link`s.
- Request (post-fan-out cleanup): give `CtaPanel` actions an `external` option so
  the Security page can drop its local copy of the panel.

## WS13 — Legal

- Details in `notes/ws13.md`. `legal.tsx` is now `LegalLayout` + `Code`; the two
  pages pass their sections as data with the text unchanged.

## WS14 — Tests, QA, PR

- Ownership-table additions (orchestrator, post-fan-out): `phone-mock.tsx` (deprecated
  shims removed), `reveal.tsx` + `globals.css` (reveal performance, below),
  `pricing/audience-tabs.tsx` (screen-reader "Plans" h2 so the outline is h1 → h2 → h3),
  `(marketing)/layout.tsx` (DM Sans `preload: false`), `docs/MARKETING.md`,
  `docs/BILLING.md`, `docs/OWNER-ROADMAP-BRIEF.md` (display names), `qa/` screenshots.
- Tests (§5): Home H1 assertion → "Scan the tag"; new e2e for `/pricing?for=owners`
  (Free / Kitchen / Multi-kitchen) and the 375px header menu; `reveal.test.tsx`
  (server render never hidden). `$79` / `$24` locators use `exact: true` because the
  compare table now also renders "$79/mo".
- Full CI sequence green locally: lint, `tsc --noEmit`, vitest 35 files / 459 tests,
  `next build`, Playwright 9 passed / 1 CI-only skip.
- Responsive pass: every marketing route at 380 / 560 / 760 / 880 / 1100 / 1440 —
  all 200, no horizontal overflow, no console errors. Light pages (/login, /signup,
  not-found, /e/<bad token>, /invite/<bad token>) unchanged apart from the mark.
- Reduced motion: 18 of 20 reveal groups start hidden below the fold with motion on
  and all reveal on scroll; with `prefers-reduced-motion: reduce` none are hidden and
  `scroll-behavior` is `auto`.
- Lighthouse (mobile, production build, this container; main = same worktree build):

  | Route | Perf main → branch | A11y main → branch |
  | --- | --- | --- |
  | `/` | 97 → 92 | 92 → 100 |
  | `/pricing` | 94 → 93 | 95 → 100 |
  | `/restaurants` | 96 → 93 | 96 → 100 |

  Contrast audit passes on all three. The first branch run scored 84 / 87 / 93: a trace
  showed 22 style recalcs and 6 layouts at load, from (a) every `Reveal` reading its
  rect then writing `data-reveal` (a forced layout each) and (b) the `[data-reveal]`
  transition animating the below-fold groups *to* hidden for 0.7s. Fixed by batching
  all reads before any write in one animation frame with a shared observer, and by
  putting the transition on the visible state only. The remaining gap is the longer
  pages (Home DOM 809 nodes vs 557) and font bytes: the root layout still preloads
  Geist Sans + Mono (138KB) on marketing routes that never use them — see follow-ups.
- `docs/design/marketing-2026-09/qa/`: before (main) and after screenshots at 1440,
  plus after at 380 and the light login/signup pages, downscaled JPEGs.

## Follow-ups found during the build

- Root `layout.tsx` preloads Geist Sans + Mono for every route; marketing pages use
  Inter and pay ~138KB of unused font bytes on first paint. Loading Geist only where
  it is used (or dropping its preload) would recover most of the remaining mobile
  performance gap. Root layout is outside this brief's ownership table.
- `CtaPanel` actions could take an `external` flag so the Security page's `mailto:`
  panel stops carrying a local copy of the panel markup (`notes/ws12.md`).
- The design's FAQ answers differ from `faq-data.ts` in wording/punctuation
  (`notes/ws9.md`); the brief limited that file to the D4 rename.
- Small primitive requests from the page workstreams (`tag-mock.tsx` size prop,
  `feature-list.tsx` check size, `phone-mock.tsx` padTop, `section.tsx` rule gap) are
  worked around locally; see `notes/ws5.md`, `ws6.md`, `ws8.md`.

## Out of scope (BRIEF.md §8)

- Promoting the Nocturne theme app-wide (dashboard, auth, admin).
- Re-branding customer-facing surfaces (`DEFAULT_BRAND_COLOR`, email `BRAND_COLOR`,
  vendor-dispatch teal, branding-settings placeholder). Use `#05915e` for fills that
  carry white text when that happens, and update `branding.test.ts`.
- Real customer logos, testimonial quote, About photo — flip `showSocialProof`, add the
  quote section, add the photo block when assets exist.
- Stripe product display-name rename ("Site" → "Kitchen", "Multi-site" → "Multi-kitchen"),
  manual in the Stripe dashboard (test + live).
- Root `layout.tsx` title template wording — revisit after the new positioning is approved.
