-- Stripe subscription billing: a `subscriptions` row per company (owned by
-- the webhook via the service-role client — never written to directly by
-- clients), a 14-day trial tracked on `companies`, a small `plan_limits`
-- reference table for DB-level enforcement, and a `get_company_entitlements()`
-- RPC so the dashboard can gate access in one call.
--
-- Keep this in sync with src/lib/plans.ts (plan ids, limits, TRIAL_DAYS,
-- TRIAL_PLAN) — see the comment above the `plan_limits` seed below.

-- ============================================================================
-- companies: trial + Stripe customer tracking
-- ============================================================================

alter table companies add column trial_ends_at timestamptz;
alter table companies add column stripe_customer_id text;

-- Backfill: every company that existed before billing shipped gets a fresh
-- 14-day trial starting now, rather than an already-expired one.
update companies set trial_ends_at = now() + interval '14 days' where trial_ends_at is null;

alter table companies alter column trial_ends_at set not null;
-- Matches TRIAL_DAYS in src/lib/plans.ts — new companies start a 14-day trial.
alter table companies alter column trial_ends_at set default (now() + interval '14 days');

-- ============================================================================
-- subscriptions: one row per company, owned by the Stripe webhook
-- ============================================================================

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references companies(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan_id text,
  interval text check (interval in ('month', 'year')),
  status text not null check (
    status in ('trialing', 'active', 'past_due', 'canceled', 'incomplete', 'unpaid', 'paused')
  ),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  trial_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_company_id_idx on subscriptions (company_id);
create index subscriptions_stripe_customer_id_idx on subscriptions (stripe_customer_id);
create index subscriptions_stripe_subscription_id_idx on subscriptions (stripe_subscription_id);

alter table subscriptions enable row level security;

-- Read-only for tenants: staff can see their own company's subscription
-- status. There is intentionally no insert/update/delete policy — the row
-- is only ever written by src/lib/supabase/admin.ts (the service-role
-- client), used exclusively from the Stripe webhook route, which bypasses
-- RLS entirely. Client code must never be able to grant itself a plan.
create policy "Staff can view own company subscription" on subscriptions
  for select using (company_id = get_my_company_id());

-- ============================================================================
-- plan_limits: reference table used by the DB-level equipment-limit trigger
-- below. Keep these three rows in sync with the `plans` array in
-- src/lib/plans.ts (equipmentLimit / memberLimit) — that TS file is the
-- source of truth for pricing/copy, this table is just enough of a mirror
-- for Postgres to enforce the equipment limit without round-tripping to the
-- app. member_limit is informational here (not currently trigger-enforced
-- at the DB level — member limits are enforced in application code via
-- canAddMember() since team invites are a lower-risk, staff-only action).
-- ============================================================================

create table plan_limits (
  id text primary key,
  equipment_limit int not null,
  member_limit int
);

insert into plan_limits (id, equipment_limit, member_limit) values
  ('starter', 50, 2),
  ('pro', 300, 10),
  ('business', 1500, null);

alter table plan_limits enable row level security;

create policy "Anyone authenticated can view plan limits" on plan_limits
  for select using (true);

-- ============================================================================
-- create_company_and_profile: copied from 0001_init.sql, now starting a
-- trial on the new company.
-- ============================================================================

create or replace function create_company_and_profile(
  p_company_name text,
  p_notification_email text,
  p_full_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_slug text;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated';
  end if;

  -- Idempotent: if this user already has a profile (e.g. a retry, or the
  -- onboarding fallback firing after the metadata-based auto-create already
  -- ran), just return their existing company instead of erroring.
  select company_id into v_company_id from profiles where id = auth.uid();
  if v_company_id is not null then
    return v_company_id;
  end if;

  v_slug := lower(regexp_replace(p_company_name, '[^a-zA-Z0-9]+', '-', 'g'))
    || '-' || substr(md5(random()::text), 1, 6);

  -- New companies get a 14-day trial (matches TRIAL_DAYS in src/lib/plans.ts).
  insert into companies (name, slug, notification_email, trial_ends_at)
  values (p_company_name, v_slug, p_notification_email, now() + interval '14 days')
  returning id into v_company_id;

  -- The dashboard can fire two near-simultaneous requests right after email
  -- confirmation (router prefetch racing the real navigation), so a second
  -- concurrent call can reach this same point before the first commits. If
  -- we lose that race, adopt the winner's company instead of erroring.
  insert into profiles (id, company_id, full_name, role)
  values (auth.uid(), v_company_id, p_full_name, 'owner')
  on conflict (id) do nothing;

  if not found then
    select company_id into v_company_id from profiles where id = auth.uid();
  end if;

  return v_company_id;
end;
$$;

grant execute on function create_company_and_profile(text, text, text) to authenticated;

-- ============================================================================
-- get_company_entitlements(): one-call summary the dashboard uses to decide
-- what to render (locked screen, trial banner, usage bars, feature gates).
-- security definer + get_my_company_id() so it always reflects the caller's
-- own company regardless of the narrow subscriptions SELECT policy.
-- ============================================================================

create or replace function get_company_entitlements()
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_company_id uuid;
  v_trial_ends_at timestamptz;
  v_plan_id text;
  v_status text;
  v_current_period_end timestamptz;
  v_equipment_count int;
  v_member_count int;
  v_trial_active boolean;
  v_has_paid_or_trialing_sub boolean;
  v_is_trialing boolean;
  v_is_locked boolean;
begin
  v_company_id := get_my_company_id();
  if v_company_id is null then
    raise exception 'Must be authenticated';
  end if;

  select c.trial_ends_at into v_trial_ends_at from companies c where c.id = v_company_id;

  select s.plan_id, s.status, s.current_period_end
  into v_plan_id, v_status, v_current_period_end
  from subscriptions s
  where s.company_id = v_company_id;

  select count(*) into v_equipment_count from equipment where company_id = v_company_id;
  select count(*) into v_member_count from profiles where company_id = v_company_id;

  v_trial_active := v_trial_ends_at is not null and v_trial_ends_at > now();
  v_has_paid_or_trialing_sub := v_status in ('active', 'trialing');

  -- Locked = no active/trialing Stripe subscription AND the free trial has
  -- expired. A canceled/past_due/unpaid/incomplete/paused subscription
  -- doesn't lock the account on its own while the trial clock is still
  -- running; once the trial is over, only 'active' or 'trialing' keeps it
  -- unlocked.
  v_is_locked := not v_has_paid_or_trialing_sub and not v_trial_active;

  -- "Trialing" for UI purposes: still inside the trial window and not
  -- already on a paying ('active') subscription.
  v_is_trialing := v_trial_active and coalesce(v_status, '') <> 'active';

  if v_is_trialing then
    -- Trial companies get TRIAL_PLAN's features (matches TRIAL_PLAN = 'pro'
    -- in src/lib/plans.ts), regardless of any stale/incomplete subscription
    -- plan_id that may be sitting on the row.
    v_plan_id := 'pro';
  elsif v_plan_id is null then
    v_plan_id := 'starter';
  end if;

  return json_build_object(
    'plan_id', v_plan_id,
    'status', coalesce(v_status, case when v_trial_active then 'trialing' else 'none' end),
    'trial_ends_at', v_trial_ends_at,
    'current_period_end', v_current_period_end,
    'equipment_count', v_equipment_count,
    'member_count', v_member_count,
    'is_trialing', v_is_trialing,
    'is_locked', v_is_locked
  );
end;
$$;

grant execute on function get_company_entitlements() to authenticated;

-- ============================================================================
-- get_company_plan_flags(): public-safe (anon-callable) equivalent of just
-- the "is aiChat enabled" question, for the /e/[qrToken] scan flow where the
-- viewer is an anonymous customer, not staff. Takes company_id explicitly
-- (already exposed to that flow via resolve_qr_code) rather than
-- get_my_company_id(). Deliberately returns nothing sensitive (no counts, no
-- Stripe ids) since it's callable by anyone who can view the guide.
-- ============================================================================

create or replace function get_company_plan_flags(p_company_id uuid)
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_trial_ends_at timestamptz;
  v_plan_id text;
  v_status text;
  v_trial_active boolean;
  v_is_trialing boolean;
  v_is_locked boolean;
begin
  select c.trial_ends_at into v_trial_ends_at from companies c where c.id = p_company_id;

  if not found then
    return json_build_object('plan_id', 'starter', 'is_trialing', false, 'is_locked', true);
  end if;

  select s.plan_id, s.status into v_plan_id, v_status
  from subscriptions s
  where s.company_id = p_company_id;

  v_trial_active := v_trial_ends_at is not null and v_trial_ends_at > now();
  v_is_locked := not (v_status in ('active', 'trialing')) and not v_trial_active;
  v_is_trialing := v_trial_active and coalesce(v_status, '') <> 'active';

  if v_is_trialing then
    v_plan_id := 'pro'; -- TRIAL_PLAN in src/lib/plans.ts
  elsif v_plan_id is null then
    v_plan_id := 'starter';
  end if;

  return json_build_object('plan_id', v_plan_id, 'is_trialing', v_is_trialing, 'is_locked', v_is_locked);
end;
$$;

grant execute on function get_company_plan_flags(uuid) to anon, authenticated;

-- ============================================================================
-- DB-level backstop for the equipment limit. The primary UX lives in
-- src/lib/billing.ts (assertCanAddEquipment, called from createEquipment
-- with a friendly error) — this trigger exists so the limit holds even if
-- some future code path inserts into `equipment` directly.
-- ============================================================================

create or replace function enforce_equipment_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trial_ends_at timestamptz;
  v_plan_id text;
  v_status text;
  v_trial_active boolean;
  v_limit int;
  v_count int;
begin
  select c.trial_ends_at into v_trial_ends_at from companies c where c.id = new.company_id;

  select s.plan_id, s.status into v_plan_id, v_status
  from subscriptions s
  where s.company_id = new.company_id;

  v_trial_active := v_trial_ends_at is not null and v_trial_ends_at > now();

  if v_trial_active and coalesce(v_status, '') <> 'active' then
    v_plan_id := 'pro'; -- TRIAL_PLAN in src/lib/plans.ts
  elsif v_plan_id is null or v_status not in ('active', 'trialing') then
    -- No usable subscription and no active trial: fall back to Starter's
    -- limit rather than letting an unpaid/locked account add equipment
    -- without bound.
    v_plan_id := coalesce(v_plan_id, 'starter');
  end if;

  select equipment_limit into v_limit from plan_limits where id = v_plan_id;
  if v_limit is null then
    select equipment_limit into v_limit from plan_limits where id = 'starter';
  end if;

  select count(*) into v_count from equipment where company_id = new.company_id;

  if v_count >= v_limit then
    raise exception 'EQUIPMENT_LIMIT_REACHED: this company''s plan (%) allows up to % pieces of equipment', v_plan_id, v_limit;
  end if;

  return new;
end;
$$;

create trigger equipment_enforce_limit
  before insert on equipment
  for each row execute function enforce_equipment_limit();
