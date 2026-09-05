-- Fix: get_company_entitlements() and get_company_plan_flags() returned
-- is_locked = NULL (never locked) for companies with no `subscriptions` row,
-- because `NULL in (...)` is NULL and `NOT NULL AND true` is NULL. Every
-- trial that never started checkout would keep access forever after the
-- trial expired. Coalesce the status first, matching enforce_equipment_limit().
-- Function bodies are otherwise identical to 0007_billing.sql.

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
  v_has_paid_or_trialing_sub := coalesce(v_status, '') in ('active', 'trialing');

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
  elsif v_is_locked or v_plan_id is null then
    -- Locked, or no subscription row at all: don't report a stale paid
    -- plan_id left over from before a subscription lapsed.
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
  v_is_locked := not (coalesce(v_status, '') in ('active', 'trialing')) and not v_trial_active;
  v_is_trialing := v_trial_active and coalesce(v_status, '') <> 'active';

  if v_is_trialing then
    v_plan_id := 'pro'; -- TRIAL_PLAN in src/lib/plans.ts
  elsif v_is_locked or v_plan_id is null then
    -- Locked (trial over, no active/trialing subscription): don't keep
    -- reporting a stale paid plan_id left on the subscriptions row from
    -- before it lapsed — that would let a company that stopped paying keep
    -- premium features (e.g. AI chat) on the public guide indefinitely.
    v_plan_id := 'starter';
  end if;

  return json_build_object('plan_id', v_plan_id, 'is_trialing', v_is_trialing, 'is_locked', v_is_locked);
end;
$$;

grant execute on function get_company_plan_flags(uuid) to anon, authenticated;
