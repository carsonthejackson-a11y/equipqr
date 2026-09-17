# Marketing site

Public marketing site, in the `src/app/(marketing)/` route group. It shares the root layout
(`src/app/layout.tsx`) for fonts/toaster/SEO defaults, but has its own header/footer via
`src/app/(marketing)/layout.tsx`. It does **not** wrap `(auth)`, `dashboard`, `admin`, or the
public scan flow at `/e/[qrToken]` — those keep their existing layouts untouched (the `(auth)`
layout only gained a "← Back to site" link).

## Routes

| Route        | File                                                    | Copy lives in |
| ------------ | -------------------------------------------------------- | -------------- |
| `/`          | `src/app/(marketing)/page.tsx`                            | Inline in the page (hero, feature grid, industries, why-we-built-this, FAQ subset) |
| `/features`  | `src/app/(marketing)/features/page.tsx`                   | Inline in the page |
| `/pricing`   | `src/app/(marketing)/pricing/page.tsx`                     | Plan data from `src/lib/plans.ts`; billing FAQ from `_components/faq-data.ts` |
| `/faq`       | `src/app/(marketing)/faq/page.tsx`                         | `_components/faq-data.ts` (`productFaqs` + `billingFaqs`) |
| `/about`     | `src/app/(marketing)/about/page.tsx`                       | Inline in the page (founder story) |
| `/contact`   | `src/app/(marketing)/contact/page.tsx` + `contact-form.tsx` + `actions.ts` | Inline; support email from `src/lib/site.ts` (`SUPPORT_EMAIL`, env `NEXT_PUBLIC_SUPPORT_EMAIL`) |
| `/terms`     | `src/app/(marketing)/terms/page.tsx`                       | Inline — **template text, needs a lawyer's review** (see in-page notice) |
| `/privacy`   | `src/app/(marketing)/privacy/page.tsx`                     | Inline — **template text, needs a lawyer's review** (see in-page notice) |
| `/security`  | `src/app/(marketing)/security/page.tsx`                    | Inline in the page |
| `/restaurants` | `src/app/(marketing)/restaurants/page.tsx`               | Inline in the page (owner roadmap — see below) |

Shared pieces under `src/app/(marketing)/_components/` (redesigned September 2026 —
spec and design references in `docs/design/marketing-2026-09/`, primitive API reference in
`docs/design/marketing-2026-09/notes/ws3.md`):

- `site-header.tsx` / `site-footer.tsx` — sticky blurred header (Features / Pricing /
  Restaurants / FAQ, mobile panel below 880px) and the footer, used by the route group layout.
- Layout primitives: `container.tsx`, `section.tsx` (section rhythm + faded rule),
  `kicker.tsx` (`Kicker`, `SectionHeader`, the heading class scale), `reveal.tsx`
  (scroll reveal; server-rendered content is never hidden), `panel.tsx`, `tag.tsx`,
  `icon.tsx` (Lucide wrapper with square caps), `ghost-link.tsx`, `jump-nav.tsx`,
  `cta-panel.tsx`, `step-card.tsx`, `feature-list.tsx`, `icon-row.tsx`, `feature-row.tsx`,
  `segmented.tsx`.
- Plan display: `plan-card.tsx` (driven by `src/lib/plans.ts`; used on `/pricing` and the
  `/restaurants` teaser) and `compare-table.tsx` (the provider/owner compare rows, used on
  `/pricing` and the `/features` plans matrix; the batch-QR row follows `FEATURES.batchQr`).
- Static mocks: `phone-mock.tsx` (frame + screen blocks), `dashboard-mock.tsx`,
  `timeline-card.tsx`, `tag-mock.tsx`. No screenshots or image assets.
- `faq-item.tsx` / `faq-data.ts` — `<details>/<summary>` accordion and the FAQ copy
  (`productFaqs`, `billingFaqs`, `ownerFaqs`).
- `legal.tsx` — `LegalLayout` for `/terms` and `/privacy` (sections passed as data).

Theme: the marketing route group is the only part of the app on the dark "Nocturne" theme.
`src/app/(marketing)/layout.tsx` puts `dark theme-nocturne` on its root and loads Inter and
DM Sans (wordmark only) through `next/font/google`; the token block lives in
`src/app/globals.css` under `.theme-nocturne` with `eq-*` Tailwind utilities. The dashboard,
auth and public scan pages keep the light theme and Geist.

## Owner roadmap (Phase 1, Model A)

`docs/OWNER-ROADMAP-BRIEF.md` §3.4. Two additions, both scoped to `equipment_owner` companies
(restaurants, cafes, and other businesses that own the equipment they track instead of
servicing other people's):

- **`/restaurants`** — a dedicated landing page: hero, an illustrative "7:40pm dishwasher"
  scenario (not a real customer), the four-step flow, phone mocks of what staff see (reusing
  `phone-mock.tsx`'s `PhoneFrame`, same convention as the homepage), a feature grid of what the
  owner sees, an owner pricing teaser, and owner FAQs. The one factual, attributed stat allowed
  by the brief — MachineQ's 2026 restaurant-operator downtime survey — appears exactly once,
  in the story section. **No other numeric claim, named customer, logo, or testimonial appears
  anywhere in this build** — there are no customers yet.
- **`/pricing` is segmented** by audience via `pricing/audience-tabs.tsx` (client component,
  `?for=owners|providers` URL param, default `providers`). `AudienceTabs` reads the query
  param with `useSearchParams`, which requires a `Suspense` boundary on this statically
  rendered page — `pricing/page.tsx` wraps it with `<Suspense fallback={<ProviderPricingSection />}>`,
  where `ProviderPricingSection` (exported from `audience-tabs.tsx`) is the exact same content
  rendered inside the "providers" tab, so there's no visible flash between the prerendered HTML
  and the hydrated client render. `/restaurants`'s pricing teaser links `/pricing?for=owners`.

Sign-up entry point: `/signup?kind=owner` (and `?kind=provider`) per brief §9 Q8 — the sign-up
page's kind step itself is WS2's file, not this workstream's.

## Pricing data

`src/lib/plans.ts` is the source of truth for plan names, prices, limits, feature flags, and
copy — **owned by the billing workstream**, kept in this exact shape here so a merge is
trivial. `/pricing`'s comparison table and both pricing-card usages read from it directly;
don't hardcode plan numbers anywhere else.

Pre-printed sticker batches (`FEATURES.batchQr` in `src/lib/features.ts`) were parked for the
original launch (default off) but the Next roadmap (Sept 2026) un-parked them — the flag now
defaults **on** — and restored their marketing copy; see `docs/BATCH-QR.md` for exactly what it
gates today. `/pricing`'s comparison table has a "Pre-printed batch QR sticker orders" row wired
to `plan.features.batchQr`, skipped (not deleted) whenever `FEATURES.batchQr` is off, since it
reflects live plan data rather than static copy — this is what to check if that row ever needs
to disappear again.

## SEO

- `src/app/layout.tsx` sets the site-wide `metadataBase`, title template (`%s · EquipQR`), and
  default OpenGraph/Twitter metadata from `src/lib/site.ts`.
- Each marketing page sets its own `title`/`description` via `export const metadata`.
- `src/app/(marketing)/opengraph-image.tsx` generates the share image with `ImageResponse`
  (hex colors only — Satori doesn't support `oklch`, so this does **not** import
  `globals.css`).
- `src/app/sitemap.ts` and `src/app/robots.ts` cover the marketing routes; robots disallows
  `/dashboard`, `/admin`, `/e/`, and `/api`.
- `/` includes a `SoftwareApplication` JSON-LD block.

## Contact form

`src/app/(marketing)/contact/page.tsx` is a server component that checks for
`RESEND_API_KEY`/`RESEND_FROM_EMAIL` at render time. If both are set, it renders the client
form (`contact-form.tsx`, a `useActionState` form posting to the `submitContactForm` server
action in `actions.ts`, which emails `SUPPORT_EMAIL` via Resend). If not, it shows a plain
mailto fallback instead of a form that would always fail. The mailto link to `SUPPORT_EMAIL` is
also shown alongside the form either way.

## Env vars used

- `NEXT_PUBLIC_APP_URL` — existing var, reused as the site's canonical URL (`SITE_URL` in
  `src/lib/site.ts`).
- `NEXT_PUBLIC_SUPPORT_EMAIL` — new, optional. Defaults to `support@equipqr.co`.
- `RESEND_API_KEY` / `RESEND_FROM_EMAIL` — existing vars, reused by the contact form.

## Known gaps

- `/terms` and `/privacy` are reasonable template copy, not reviewed legal text — flagged
  in-page and here.
- No `next-themes` `ThemeProvider` is wired up anywhere in the app yet (only `sonner.tsx`
  calls `useTheme()`), so there's no visible light/dark toggle. All marketing UI uses the
  semantic color tokens from `globals.css` (`bg-background`, `text-foreground`, `bg-card`,
  `bg-accent`/`text-accent-foreground`, etc.) so it will render correctly whenever `.dark` is
  toggled on `<html>` by another workstream.
