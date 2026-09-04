-- Polish workstream: unified transactional email tracking columns, scan
-- analytics, and self-serve company deletion.
--
-- Three independent pieces:
--   1. companies gets three new best-effort/idempotency timestamp columns
--      (welcome email, trial-ending reminder, onboarding checklist dismiss).
--   2. scan_events: a lightweight table + security definer RPC so the public
--      QR scan page can record a scan without exposing any table access to
--      anon directly.
--   3. delete_company(): owner-only self-serve company deletion (RLS has no
--      delete policy on companies at all, matching the "no direct
--      insert/delete — only through a security definer RPC" convention used
--      elsewhere in this schema).

-- ============================================================================
-- companies: new tracking columns
-- ============================================================================

alter table companies add column welcome_email_sent_at timestamptz;
alter table companies add column trial_reminder_sent_at timestamptz;
alter table companies add column onboarding_dismissed_at timestamptz;

-- ============================================================================
-- scan_events: one row per QR scan (public page view), for lightweight
-- analytics. Never trusts client-supplied ids — always resolved server-side
-- from the token via record_scan() below.
-- ============================================================================

create table scan_events (
  id uuid primary key default gen_random_uuid(),
  qr_code_id uuid not null references qr_codes(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  equipment_id uuid references equipment(id) on delete set null,
  scanned_at timestamptz not null default now(),
  user_agent text
);

create index scan_events_company_id_idx on scan_events (company_id);
create index scan_events_qr_code_id_idx on scan_events (qr_code_id);
create index scan_events_equipment_id_idx on scan_events (equipment_id);
create index scan_events_scanned_at_idx on scan_events (scanned_at);

alter table scan_events enable row level security;

-- Staff can view their own company's scan history. No insert/update/delete
-- policy — rows are only ever written by record_scan() below, a security
-- definer function that (like submit_service_request()) bypasses RLS
-- entirely rather than needing an anon insert policy.
create policy "Staff view own company scan events" on scan_events
  for select using (company_id = get_my_company_id());

-- Anon-callable: resolves the company/equipment from the token server-side
-- and records a scan. Silently ignores unknown tokens (returns without
-- raising) so a bad/stale token never surfaces an error to the public page.
create or replace function record_scan(p_qr_token text, p_user_agent text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code record;
begin
  select id, company_id, equipment_id into v_code from qr_codes where token = p_qr_token;

  if v_code.id is null then
    return;
  end if;

  insert into scan_events (qr_code_id, company_id, equipment_id, user_agent)
  values (v_code.id, v_code.company_id, v_code.equipment_id, p_user_agent);
end;
$$;

grant execute on function record_scan(text, text) to anon, authenticated;

-- ============================================================================
-- delete_company(): owner-only, deletes the caller's own company. Every
-- child table's company_id (directly or transitively, e.g. guide_steps ->
-- equipment_types) is `references companies(id) on delete cascade`, so this
-- single delete clears all tenant data. profiles rows (including the
-- caller's own) cascade too — the caller's auth.users row is untouched, they
-- just have no profile left afterwards.
--
-- Storage objects (service-request-media) are NOT covered by this RPC —
-- Postgres cascades don't reach Supabase Storage. The calling server action
-- is expected to look up and delete those objects via the admin client
-- before/after calling this; see src/app/dashboard/settings/account/actions.ts.
-- ============================================================================

create or replace function delete_company()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if not is_company_owner() then
    raise exception 'Only owners can delete the company';
  end if;

  v_company_id := get_my_company_id();
  if v_company_id is null then
    raise exception 'Must be authenticated';
  end if;

  delete from companies where id = v_company_id;
end;
$$;

grant execute on function delete_company() to authenticated;
