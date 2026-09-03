# Contributing

Start with **`docs/AGENT-BRIEF.md`** — it covers the stack, conventions, data model, and the
rules that keep this a multi-tenant app (RLS on every table, `security definer` RPCs for
anything public/anon-callable, etc.). Read it before writing any code here.

A few things worth knowing up front:

- This Next.js version differs from what most tooling and training data assumes — check
  `node_modules/next/dist/docs/` for anything Next-specific before relying on memory.
- `npm run lint`, `npx tsc --noEmit`, `npm test`, and `npm run build` must all pass before you
  open a PR. CI (`.github/workflows/ci.yml`) runs all four, plus the Playwright smoke suite.
- Migrations in `supabase/migrations/` are append-only — never edit or delete an existing file,
  only add a new numbered one. CI enforces this (`.github/workflows/migrations-check.yml`).
- See `README.md` for local setup, environment variables, and deployment; `docs/RUNBOOK.md`
  for incident response.
