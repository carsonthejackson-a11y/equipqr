# EquipQR

QR-code-driven equipment troubleshooting and service requests for field-service companies
(HVAC, coffee machine repair, plumbing, etc.).

A company tags each piece of equipment it services with a QR sticker. A customer scans the
sticker — no login required — and walks through a branching troubleshooting guide; if that
doesn't resolve it, they submit a service request with photos or video straight from their
phone. Company staff (owners and technicians) manage customers, equipment, guides, and the
resulting request queue from `/dashboard`.

## Architecture

```
┌──────────────┐        ┌───────────────────────────┐        ┌──────────────────────┐
│   Customer   │  scan  │           EquipQR          │        │       Supabase       │
│  (no login)  │───────▶│   Next.js 16 App Router    │◀──────▶│  Postgres + Auth +    │
└──────────────┘        │                             │        │  Storage, RLS-scoped  │
                         │  /e/[qrToken]  (public)     │        │  per company_id       │
┌──────────────┐        │  /dashboard/*  (staff)      │        └──────────────────────┘
│ Owner / Tech │  login │  /admin/*      (platform)    │
│    (staff)   │───────▶│  /api/*        (routes)      │        ┌──────────────────────┐
└──────────────┘        └──────────────┬──────────────┘        │       Resend         │
                                        │                        │  service-request /    │
                                        │  optional integrations │  resolution emails    │
                                        ├───────────────────────▶└──────────────────────┘
                                        │
                                        │                        ┌──────────────────────┐
                                        ├───────────────────────▶│   Anthropic API      │
                                        │                        │  AI guide drafting +  │
                                        │                        │  chat classification  │
                                        │                        └──────────────────────┘
                                        │
                                        │                        ┌──────────────────────┐
                                        └───────────────────────▶│       Sentry          │
                                                                  │   error tracking       │
                                                                  └──────────────────────┘
```

**Data model** (see `src/lib/types.ts` and `supabase/migrations/`):

```
companies ─┬─ profiles (role: owner | technician)
           ├─ customers
           ├─ equipment_types ─ guide_steps ─ guide_options   (branching guide graph)
           ├─ equipment (customer_id, equipment_type_id)
           ├─ qr_codes (token, equipment_id, source: instant | batch)
           └─ service_requests ─ service_request_media
                (+ troubleshooting_path, ai_summary, resolution_*)

platform_admins   — operate QR code batches across companies, not tied to one
```

The `batch` code source, `/admin/*`, and platform admins exist to support pre-printed QR
sticker batches — parked for launch behind `FEATURES.batchQr` in `src/lib/features.ts`. See
`docs/BATCH-QR.md` for exactly what re-enabling the flag turns back on.

Every tenant table is protected by Postgres row-level security keyed on `get_my_company_id()`.
Anything the public (unauthenticated) side needs — resolving a QR token, submitting a service
request — goes through a `security definer` RPC (`resolve_qr_code`, `submit_service_request`)
that resolves the company server-side, rather than the client querying tenant tables directly.

**Stack**: Next.js 16 App Router (React 19, TypeScript strict), Tailwind v4 + shadcn
(base-ui flavor), Supabase (Postgres/Auth/Storage), Resend for email, `@anthropic-ai/sdk` for
AI guide drafting and chat, Vitest + Testing Library for unit tests, Playwright for smoke
tests, Sentry for error tracking. `src/proxy.ts` is Next 16's renamed middleware file.

## Local setup

### 1. Clone and install

```bash
git clone <this repo>
cd equipqr
nvm use          # or install node 22 — see .nvmrc
npm install
```

### 2. Create a Supabase project and run the migrations

1. Create a new project at [supabase.com](https://supabase.com).
2. Run every file in `supabase/migrations/` **in order** (`0001_...` through the highest
   number) via the SQL Editor in the Supabase dashboard — paste each file's contents and run
   it, oldest first. Or, if you have the Supabase CLI linked to the project:
   ```bash
   supabase db push
   ```
3. Grab the project's API URL and anon key from **Project Settings → API** for the next step.

Migrations are **append-only**: once merged, an existing migration file is never edited or
deleted — only new numbered files are added. CI enforces this
(`.github/workflows/migrations-check.yml`).

### 3. Configure environment variables

```bash
cp .env.local.example .env.local
```

| Variable | Required | Where to get it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase → Project Settings → API |
| `NEXT_PUBLIC_APP_URL` | Yes (defaults to `http://localhost:3000`) | Your deployed domain in production |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Supabase → Project Settings → API. Only needed for server-side scripts that must bypass RLS — the app itself runs on the anon key + RLS |
| `RESEND_API_KEY` | No — service-request/resolution emails are silently skipped without it | [resend.com/api-keys](https://resend.com/api-keys) |
| `RESEND_FROM_EMAIL` | No | Must be on a domain [verified in Resend](https://resend.com/domains) |
| `ANTHROPIC_API_KEY` | No — AI guide drafting and the customer chat assist are hidden without it | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | No | See `docs/BILLING.md` |
| `SENTRY_DSN` | No — error tracking is a no-op without it | Sentry → Settings → Projects → your project → Client Keys (DSN) |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | No | Shown to customers on public pages, if set |

All of the above are validated by `src/lib/env.ts` (zod) on first server-side access — a
missing *required* var fails fast with a message listing exactly what's missing; a missing
*optional* one just disables that feature.

**Resend domain verification**: transactional email (service-request confirmations,
resolution summaries) requires a domain verified in Resend and a `RESEND_FROM_EMAIL` address
on that domain. Until that's set up, the app runs fine — it just skips sending and logs a
warning (see `src/app/dashboard/requests/actions.ts` and `src/app/api/service-requests/route.ts`).

**Anthropic key**: powers AI guide drafting (`src/lib/anthropic.ts` → `draftTroubleshootingGuide`)
and the customer-facing chat assist during troubleshooting. Without it, those UI affordances
are hidden and the app is otherwise unaffected.

### 4. Run it

```bash
npm run dev              # http://localhost:3000
npm run lint              # eslint
npx tsc --noEmit           # typecheck
npm test                   # vitest — unit tests
npm run test:watch         # vitest, watch mode
npm run build               # production build
npm run test:e2e             # playwright — build first (npm run build), then this
```

The e2e suite (`e2e/public.spec.ts`) starts `next start` against your production build (see
`playwright.config.ts`) and smoke-tests the public, no-login surface: `/`, `/login`, `/signup`,
an unknown `/e/[qrToken]`, and `/api/health`. It never creates data.

## Deployment (Vercel)

1. **Import the repo** into Vercel.
2. **Environment variables**: set every "Required" row from the table above, plus whichever
   optional integrations you're enabling, in Vercel's Project Settings → Environment
   Variables. Set `NEXT_PUBLIC_APP_URL` to your production domain (e.g.
   `https://app.equipqr.com`) — it's used to build the public QR-code links and email links,
   so getting this wrong sends customers to the wrong place.
3. **Supabase auth redirect URLs**: in the Supabase dashboard, under Authentication → URL
   Configuration, add your production domain (and any preview-deployment domains you use) to
   the allowed redirect URLs.
4. **Supabase email template change (required)**: `src/app/auth/confirm/route.ts` handles
   signup confirmation and magic-link verification by reading `token_hash` + `type` query
   params — the modern Supabase verification flow. The **default** "Confirm signup" (and
   similar) email templates instead link to `{{ .ConfirmationURL }}`, an older hash-fragment
   delivery this route never processes, which would send new users to a broken link. In
   Supabase → Authentication → Email Templates, edit each relevant template (Confirm signup,
   Magic Link, etc.) so its link points at your confirm route instead, e.g.:
   ```
   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup
   ```
   (swap `type=signup` for `type=magiclink`, `type=recovery`, etc. per template).
5. **Billing (Stripe)**: see `docs/BILLING.md`.
6. Deploy. Vercel builds with `npm run build`; no special build command needed.

## Operations

- **Health check**: `GET /api/health` returns `{ ok, version, time, checks: { supabase } }` —
  200 when Supabase answers a lightweight query within 5s, 503 otherwise. Point uptime
  monitoring at this.
- **Error tracking**: Sentry (`@sentry/nextjs`) is wired for server, edge, and client
  runtimes (`src/instrumentation.ts`, `src/instrumentation-client.ts`, `sentry.server.config.ts`,
  `sentry.edge.config.ts`) plus friendly fallback UI (`src/app/error.tsx`,
  `src/app/global-error.tsx`, `src/app/not-found.tsx`). All of it is a complete no-op with
  `SENTRY_DSN` unset — set it in Vercel to turn it on; no code changes needed.
- **Backups**: enable Supabase's Point-in-Time Recovery (Project Settings → Add-ons, or
  Database → Backups) on any project holding real customer data. Free-tier projects only get
  daily backups with a short retention window — upgrade before going live with real tenants.
- **Rotating keys**: rotate a compromised or routinely-rotated key (Supabase anon/service
  role, Resend, Anthropic, Stripe, Sentry DSN) in its provider dashboard first, then update the
  corresponding Vercel environment variable and redeploy. Supabase anon-key rotation also
  invalidates existing sessions — expect users to be signed out.
- **Incidents**: see `docs/RUNBOOK.md`.
- **Data export & API access** (Business plan): CSV export at `/api/export/[entity]`
  (session-authenticated, from `/dashboard/settings/api`) and a public v1 REST API at
  `/api/v1/*` authenticated with per-company API keys — see `docs/API.md`.

## Contributing

See `CONTRIBUTING.md` and `docs/AGENT-BRIEF.md`.
