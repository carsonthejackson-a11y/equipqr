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

Shared pieces under `src/app/(marketing)/_components/`:

- `site-header.tsx` / `site-footer.tsx` — sticky nav + footer, used by the route group layout.
- `phone-mock.tsx` — pure Tailwind/SVG phone-frame mock of the `/e/[qrToken]` scan flow
  (`ScanScreen`, `GuideScreen`, `RequestScreen`), used on `/` and `/features`. No screenshots
  or image assets.
- `pricing-cards.tsx` — the 3-card plan display, driven entirely by `src/lib/plans.ts`; used on
  `/` (pricing teaser, fixed to monthly) and on `/pricing` (via `pricing-toggle.tsx`, a client
  component that owns the monthly/yearly toggle state).
- `faq-item.tsx` / `faq-data.ts` — `<details>/<summary>` accordion (no JS required to expand)
  and the FAQ copy, split into `productFaqs` and `billingFaqs`.
- `legal.tsx` — shared header/prose wrapper/notice for the `/terms`, `/privacy` pages.

## Pricing data

`src/lib/plans.ts` is the source of truth for plan names, prices, limits, feature flags, and
copy — **owned by the billing workstream**, kept in this exact shape here so a merge is
trivial. `/pricing`'s comparison table and both pricing-card usages read from it directly;
don't hardcode plan numbers anywhere else.

Pre-printed sticker batches are parked for launch (`FEATURES.batchQr` in
`src/lib/features.ts`, default off) and their marketing copy has been removed outright rather
than flag-gated — see `docs/BATCH-QR.md` for exactly what to restore when it's re-enabled. The
one exception is `/pricing`'s comparison table, which still has a "Pre-printed batch QR sticker
orders" row wired to `plan.features.batchQr` — that row is skipped (not deleted) whenever
`FEATURES.batchQr` is off, since it reflects live plan data rather than static copy.

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
