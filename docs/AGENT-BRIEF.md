# EquipQR — engineering brief for contributors

EquipQR is a multi-tenant SaaS for field-service companies (HVAC, coffee machine repair, plumbing, etc.).
A company tags each piece of equipment it services with a QR sticker. The company's **customers** scan
the sticker (no login) to walk through a branching troubleshooting guide and, if that fails, submit a
service request with photos/video. Company staff (owners + technicians) manage everything in `/dashboard`.

## Stack (read `node_modules/next/dist/docs/` before writing Next.js code — this Next version differs from training data)
- Next.js 16 App Router, React 19, TypeScript strict. `src/proxy.ts` is the middleware (Next 16 renamed it — do NOT add `middleware.ts`).
- Tailwind v4 + shadcn (base-ui flavor: `<Button render={<Link/>} nativeButton={false}>`, `DialogTrigger render={...}`). Reuse `src/components/ui/*`.
- Supabase (Postgres + Auth + Storage). Server components use `createClient()` from `@/lib/supabase/server`; client components use `@/lib/supabase/client`. All tenant data is protected by RLS keyed on `get_my_company_id()`. Migrations live in `supabase/migrations/NNNN_name.sql` and are plain SQL run in order.
- Server actions in `actions.ts` files next to the pages; API routes under `src/app/api`.
- Email via Resend (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`). AI via `@anthropic-ai/sdk` in `src/lib/anthropic.ts`.
- Fonts: `geist` package (self-hosted). Never use `next/font/google` (blocked at build in CI).
- Lint: `npm run lint`. Typecheck: `npx tsc --noEmit`. Build: `npm run build`. Both must pass before you finish.

## Data model (see `src/lib/types.ts` and `supabase/migrations`)
companies → profiles (role: owner | technician) ; companies → customers ; companies → equipment_types → guide_steps → guide_options ;
companies → equipment (customer_id, equipment_type_id) ; qr_codes (token, company_id, equipment_id, source instant|batch) ;
service_requests (+ service_request_media, troubleshooting_path, ai_summary, resolution_*) ; platform_admins.

Public scan page: `/e/[qrToken]` (RPC `resolve_qr_code`). Public request submit: `POST /api/service-requests` (RPC `submit_service_request`).

## Conventions
- Keep tenant isolation airtight: every new table gets RLS with policies scoped by `get_my_company_id()`; anything anon-callable goes through a `security definer` RPC that resolves company server-side.
- Server actions return `{ error: string }` or `{ success: true, ... }`; client shows errors via `toast.error` (sonner) or inline `<Alert variant="destructive">`.
- Forms: react-hook-form + zod for auth pages; plain `<form action={serverAction}>` + FormData for dashboard dialogs. Either is fine; match the neighbor.
- Page headers: `<h1 className="text-2xl font-semibold">` + `<p className="text-muted-foreground">`. Empty states use `<EmptyState icon message>`.
- Roles: `owner` can do everything incl. billing/team/settings; `technician` can view + work requests/equipment but cannot change billing, team, or delete the company.
- Env vars are read via `process.env` today; a typed `src/lib/env.ts` may exist — use it if present.
- Do not commit secrets. `.env.local.example` documents every variable — add yours there.
- Migration numbers are assigned per workstream (see your task). Don't renumber existing files.
- Write small focused commits with clear messages. Don't touch files outside your workstream unless necessary; if you must edit a shared file (`types.ts`, `dashboard-nav-links.ts`, `package.json`, `.env.local.example`), keep the edit minimal and additive.
