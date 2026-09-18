-- 0028_owner_entitlement_floor.sql
--
-- Bug: an equipment_owner company whose paid subscription has lapsed
-- (status canceled / past_due / unpaid / incomplete / paused) and whose
-- in-app trial is over KEPT its paid plan in get_company_entitlements() and
-- get_company_plan_flags(). 0024 §15/§16 force `v_is_locked := false` for the
-- owner kind (correct — owners fall to a free tier instead of a paywall) but
-- then only drop to the floor plan `elsif v_is_locked or v_plan_id is null`,
-- so a subscriptions row with plan_id='multi_site', status='canceled' and an
-- expired trial still reported plan_id='multi_site' (reproduced: the
-- scratch harness returns multi_site before this file, free after).
--
-- Meanwhile the DB backstops enforce_equipment_limit() /
-- enforce_location_limit() (0024 §13/§14) already resolve the plan with
-- `coalesce(v_status, '') not in ('active', 'trialing') -> floor`, so the
-- UI (billing page, feature gates, plan badges, API/cron plan checks) and the
-- triggers disagreed for exactly these companies.
--
-- Fix: both functions re-created with their 0024 bodies verbatim except that
-- the floor branch also applies when there is no active/trialing subscription
-- (and no in-app trial — the trialing branch above it still wins). Providers
-- are unaffected: for them "no active/trialing subscription and no trial" is
-- already v_is_locked = true, which took the floor branch before.
--
-- No enum changes, so this runs inside a single transaction.

-- ============================================================================
-- 1. get_company_entitlements(): 0024 §15 body + the extended floor condition
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
  v_kind company_kind;
  v_trial_ends_at timestamptz;
  v_plan_id text;
  v_status text;
  v_current_period_end timestamptz;
  v_equipment_count int;
  v_member_count int;
  v_location_count int;
  v_trial_active boolean;
  v_has_paid_or_trialing_sub boolean;
  v_is_trialing boolean;
  v_is_locked boolean;
  v_floor text;
  v_plan_kind company_kind;
  v_max_locations int;
begin
  v_company_id := get_my_company_id();
  if v_company_id is null then
    raise exception 'Must be authenticated';
  end if;

  select c.trial_ends_at, c.kind into v_trial_ends_at, v_kind from companies c where c.id = v_company_id;

  select s.plan_id, s.status, s.current_period_end
  into v_plan_id, v_status, v_current_period_end
  from subscriptions s
  where s.company_id = v_company_id;

  select count(*) into v_equipment_count from equipment where company_id = v_company_id;
  select count(*) into v_member_count from profiles where company_id = v_company_id;
  select count(*) into v_location_count from locations where company_id = v_company_id;

  v_trial_active := v_trial_ends_at is not null and v_trial_ends_at > now();
  v_has_paid_or_trialing_sub := coalesce(v_status, '') in ('active', 'trialing');
  v_floor := case v_kind when 'equipment_owner' then 'free' else 'starter' end;

  v_is_locked := not v_has_paid_or_trialing_sub and not v_trial_active;
  -- An equipment_owner company is NEVER locked: it has a free tier to fall
  -- back to (1 location / 10 units) instead of a paywall. Providers are
  -- unchanged.
  if v_kind = 'equipment_owner' then
    v_is_locked := false;
  end if;

  v_is_trialing := v_trial_active and coalesce(v_status, '') <> 'active';

  if v_is_trialing then
    v_plan_id := case v_kind when 'equipment_owner' then 'site' else 'pro' end;
  elsif v_is_locked or v_plan_id is null or not v_has_paid_or_trialing_sub then
    -- 0028: "not locked" is not the same as "entitled" — an owner-kind
    -- company with a canceled/past_due/unpaid subscription and no trial is
    -- never locked (above) but has fallen to the kind's floor plan, exactly
    -- as enforce_equipment_limit() / enforce_location_limit() already treat it.
    v_plan_id := v_floor;
  end if;

  select company_kind, max_locations into v_plan_kind, v_max_locations from plan_limits where id = v_plan_id;
  if v_plan_kind is null or v_plan_kind is distinct from v_kind then
    v_plan_id := v_floor;
    select max_locations into v_max_locations from plan_limits where id = v_floor;
  end if;

  return json_build_object(
    'plan_id', v_plan_id,
    'status', coalesce(v_status, case when v_trial_active then 'trialing' else 'none' end),
    'trial_ends_at', v_trial_ends_at,
    'current_period_end', v_current_period_end,
    'equipment_count', v_equipment_count,
    'member_count', v_member_count,
    'is_trialing', v_is_trialing,
    'is_locked', v_is_locked,
    'company_kind', v_kind,
    'location_count', v_location_count,
    'max_locations', v_max_locations
  );
end;
$$;

-- Same signature as 0024/0013/0007 — create or replace keeps its existing
-- grant to `authenticated`. Grants unchanged; restated per 0018's rule that
-- the file alone should describe who may call it.
grant execute on function get_company_entitlements() to authenticated;

-- ============================================================================
-- 2. get_company_plan_flags(): 0024 §16 body + the extended floor condition
-- ============================================================================

create or replace function get_company_plan_flags(p_company_id uuid)
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_kind company_kind;
  v_trial_ends_at timestamptz;
  v_plan_id text;
  v_status text;
  v_trial_active boolean;
  v_is_trialing boolean;
  v_is_locked boolean;
  v_floor text;
  v_plan_kind company_kind;
begin
  select c.trial_ends_at, c.kind into v_trial_ends_at, v_kind from companies c where c.id = p_company_id;

  if not found then
    return json_build_object(
      'plan_id', 'starter', 'is_trialing', false, 'is_locked', true, 'company_kind', 'service_provider'
    );
  end if;

  select s.plan_id, s.status into v_plan_id, v_status
  from subscriptions s
  where s.company_id = p_company_id;

  v_trial_active := v_trial_ends_at is not null and v_trial_ends_at > now();
  v_floor := case v_kind when 'equipment_owner' then 'free' else 'starter' end;

  v_is_locked := not (coalesce(v_status, '') in ('active', 'trialing')) and not v_trial_active;
  if v_kind = 'equipment_owner' then
    v_is_locked := false;
  end if;

  v_is_trialing := v_trial_active and coalesce(v_status, '') <> 'active';

  if v_is_trialing then
    v_plan_id := case v_kind when 'equipment_owner' then 'site' else 'pro' end;
  elsif v_is_locked or v_plan_id is null or coalesce(v_status, '') not in ('active', 'trialing') then
    -- 0028: same rule as get_company_entitlements() — a never-locked owner
    -- company with a lapsed subscription is on the floor plan, not the plan
    -- still named on its subscriptions row.
    v_plan_id := v_floor;
  end if;

  select company_kind into v_plan_kind from plan_limits where id = v_plan_id;
  if v_plan_kind is null or v_plan_kind is distinct from v_kind then
    v_plan_id := v_floor;
  end if;

  return json_build_object('plan_id', v_plan_id, 'is_trialing', v_is_trialing, 'is_locked', v_is_locked, 'company_kind', v_kind);
end;
$$;

revoke execute on function get_company_plan_flags(uuid) from public;
grant execute on function get_company_plan_flags(uuid) to anon, authenticated;

comment on function get_company_plan_flags(uuid) is
  'Anon-callable (the /e/[qrToken] scan flow has no staff session). Deliberately returns nothing sensitive — no counts, no Stripe ids, no location/vendor data. A lapsed (non active/trialing) subscription with no in-app trial resolves to the kind''s floor plan (0028).';
