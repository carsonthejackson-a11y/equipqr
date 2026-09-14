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

## WS3 — Shared marketing primitives

## WS4 — Header + footer

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
