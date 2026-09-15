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

## WS6 — Features

## WS7 — Pricing

## WS8 — Restaurants

## WS9 — FAQ

## WS10 — About

## WS11 — Contact

## WS12 — Security

## WS13 — Legal

## WS14 — Tests, QA, PR

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
