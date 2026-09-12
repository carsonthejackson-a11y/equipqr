-- local-db: no-transaction
--
-- Owner roadmap foundation (Phase 1, Model A — see docs/OWNER-ROADMAP-BRIEF.md).
-- Adds everything an "equipment owner" company (a restaurant, café, bar, shop
-- that owns equipment and dispatches outside vendors to service it) needs
-- alongside the existing "service provider" company shape:
--
--   1. companies.kind + owner_setup_completed_at — which flavour of company
--      this is, chosen at sign-up.
--   2. locations, vendors, category_default_vendors — an owner's sites and
--      the outside companies that service their equipment.
--   3. equipment.location_id / vendor_id / warranty_vendor_id.
--   4. equipment_types.symptom_chips — the public report form's quick-pick
--      symptom chips, per company.
--   5. service_requests: requires_approval / approved_at / approved_by
--      (always false/now()/null in Phase 1 — no approval UI yet), cost_cents,
--      reporter_phone, location_id, and a denormalised dispatch_status /
--      dispatch_id kept in sync by a trigger.
--   6. dispatches — one row per vendor notification for a request, driven by
--      an unguessable token (the vendor's own no-login `/v/<token>` page).
--   7. staff_badges, equipment_access — tables only, Phase 2 UI. Both stay
--      empty after this build; equipment_access is Model B's bridge table
--      and nothing else in the database may reference it.
--   8. site_pin_passes — an opaque, expiring pass a scanning device holds
--      after verifying a location's site PIN, so the PIN itself is never
--      round-tripped to a public RPC caller.
--   9. plan_limits gets a company_kind + max_locations + history_days, three
--      new owner plan rows, and a location-count enforcement trigger
--      sibling to the existing equipment-count one.
--  10. create_company_and_profile() gains a 4-arg overload that records the
--      chosen kind; the existing 3-arg call keeps working (service_provider).
--
-- Nothing existing is dropped, renamed, or has its signature changed away
-- from what it already accepts. `request_status` and the
-- `service_requests.priority` CHECK are untouched — owner-kind urgency
-- reuses low | normal | high exactly as the provider form does.
--
-- The `-- local-db: no-transaction` header is required (see 0013's header
-- for the same reason): this file both adds `user_role` enum values and
-- must leave them usable, which `alter type ... add value` cannot do inside
-- the same transaction that references them.

-- ============================================================================
-- 1. Enums
-- ============================================================================

create type company_kind as enum ('service_provider', 'equipment_owner');
create type dispatch_channel as enum ('email', 'sms', 'phone', 'url', 'platform');
create type dispatch_status as enum
  ('pending_approval', 'sent', 'viewed', 'acknowledged', 'eta_given', 'finished', 'declined', 'failed');
create type equipment_relationship as enum ('owner', 'servicer');

-- Grantable via the existing invite flow (WS2); 'staff' is defined here and
-- never assigned to a profile in Phase 1 (magic-link badge UI is Phase 2).
alter type user_role add value if not exists 'manager' after 'owner';
alter type user_role add value if not exists 'staff' after 'technician';

-- ============================================================================
-- 2. locations
-- ============================================================================

create table locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  address text,
  phone text,
  hours text,
  site_pin text check (site_pin is null or site_pin ~ '^[0-9]{4,8}$'),
  notes text,
  active boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index locations_company_idx on locations (company_id, active, name);
create unique index locations_company_name_idx on locations (company_id, lower(name));

create trigger locations_set_updated_at
  before update on locations for each row execute function set_updated_at();

comment on column locations.site_pin is
  'Plaintext by design: a shared, owner-printable poster code, not a credential. No anon-callable RPC ever returns it (see verify_site_pin) — only its READABLE-BY-STAFF RLS policy exposes it, and only to the owning company''s staff.';

-- ============================================================================
-- 3. vendors
-- ============================================================================

create table vendors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  email text check (email is null or email ~ '^[^@[:space:],;]+@[^@[:space:],;]+\.[^@[:space:],;]+$'),
  phone text,
  dispatch_url text,
  preferred_channel dispatch_channel not null default 'email',
  hours text,
  account_number text,
  categories text[] not null default '{}'::text[],
  notes text,
  sms_consent_at timestamptz,
  ack_sla_minutes int not null default 120 check (ack_sla_minutes between 15 and 10080),
  -- Model B bridge column. Exists as a column, never read by any query in
  -- this build — see docs/OWNER-ROADMAP-BRIEF.md §1 "Explicitly deferred".
  linked_company_id uuid references companies(id) on delete set null,
  active boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vendors_company_idx on vendors (company_id, active, name);
create index vendors_linked_company_idx on vendors (linked_company_id);
create unique index vendors_company_name_idx on vendors (company_id, lower(name));

create trigger vendors_set_updated_at
  before update on vendors for each row execute function set_updated_at();

comment on column vendors.email is
  'A null email means "notify the owner only" — submit_owner_service_request() still files the request but creates no dispatch.';
comment on column vendors.linked_company_id is
  'Model B (unbuilt): would link this contact card to the vendor''s own EquipQR company. Never read in Phase 1.';

-- ============================================================================
-- 4. category_default_vendors
-- ============================================================================

create table category_default_vendors (
  company_id uuid not null references companies(id) on delete cascade,
  equipment_type_id uuid not null references equipment_types(id) on delete cascade,
  vendor_id uuid not null references vendors(id) on delete cascade,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (company_id, equipment_type_id)
);

create index category_default_vendors_vendor_idx on category_default_vendors (vendor_id);

-- ============================================================================
-- 5. Column additions
-- ============================================================================

alter table companies
  add column if not exists kind company_kind not null default 'service_provider',
  add column if not exists owner_setup_completed_at timestamptz;

comment on column companies.kind is
  'Chosen at sign-up, never changed by any RPC in this build. Drives dashboard vocabulary/nav (src/lib/vocab.ts) and plan resolution.';
comment on column companies.owner_setup_completed_at is
  'Null = the owner first-run wizard (first location + optional restaurant equipment-type seed) has not finished. Never set for service_provider companies.';

alter table equipment_types
  add column if not exists symptom_chips text[] not null default '{}'::text[];

comment on column equipment_types.symptom_chips is
  'Owner-kind public report form quick-pick chips (max ~40 chars each). Always an array; empty for provider-kind companies and any owner type that has not been given chips yet.';

-- location_id / vendor_id / warranty_vendor_id reference tables created
-- above, so this alter runs after them, and before `dispatches` /
-- `service_requests.location_id` below.
alter table equipment
  add column if not exists location_id uuid references locations(id) on delete set null,
  add column if not exists vendor_id uuid references vendors(id) on delete set null,
  add column if not exists warranty_vendor_id uuid references vendors(id) on delete set null;

create index if not exists equipment_location_id_idx on equipment (location_id);
create index if not exists equipment_vendor_id_idx on equipment (vendor_id);
create index if not exists equipment_warranty_vendor_id_idx on equipment (warranty_vendor_id);

comment on column equipment.location_id is
  'The site this unit lives at (owner-kind). Distinct from the free-text equipment.location column, which stays "where in the building" (e.g. "walk-in corridor").';
comment on column equipment.warranty_vendor_id is
  'Preferred over vendor_id by submit_owner_service_request() while warranty_ends_on has not passed. No other warranty-routing rule exists in Phase 1.';

alter table service_requests
  add column if not exists requires_approval boolean not null default false,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references profiles(id) on delete set null,
  add column if not exists cost_cents int check (cost_cents is null or cost_cents >= 0),
  add column if not exists reporter_phone text,
  add column if not exists location_id uuid references locations(id) on delete set null;

create index if not exists service_requests_location_id_idx on service_requests (location_id);

comment on column service_requests.requires_approval is
  'Always false in Phase 1 — no approval UI exists. Column exists so the workflow can be added later without another migration.';
comment on column service_requests.reporter_phone is
  'Duplicates what submit_owner_service_request() also writes to contact_phone. contact_phone is the channel column every existing notification path already reads; reporter_phone is the stable "who reported it" value the owner UI and the vendor page show. Neither is derived from the other.';

-- dispatch_status / dispatch_id are denormalised and trigger-maintained by
-- dispatches_sync_request() below, once the `dispatches` table exists.
alter table service_requests
  add column if not exists dispatch_status dispatch_status,
  -- No foreign key: a real FK would make service_requests <-> dispatches
  -- circular against dispatches' own service_request_id FK / cascade.
  add column if not exists dispatch_id uuid;

create index if not exists service_requests_dispatch_status_idx on service_requests (company_id, dispatch_status);

comment on column service_requests.dispatch_id is
  'Denormalised pointer to the most recently created dispatch for this request, kept in sync by the dispatches_sync_request() trigger. Deliberately not a foreign key — see the comment on that trigger.';

alter table plan_limits
  add column if not exists company_kind company_kind not null default 'service_provider',
  add column if not exists max_locations int,
  add column if not exists history_days int;

comment on column plan_limits.max_locations is
  'Owner-kind plans only. Null = unlimited. Enforced by enforce_location_limit() below.';
comment on column plan_limits.history_days is
  'Display-only retention hint shown in pricing copy. Nothing in this build filters or deletes data by it.';

-- ============================================================================
-- 6. dispatches
-- ============================================================================

create table dispatches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  service_request_id uuid not null references service_requests(id) on delete cascade,
  -- restrict, not cascade/set null: a vendor with dispatch history can be
  -- deactivated (active = false) but never deleted. The UI must say so.
  vendor_id uuid not null references vendors(id) on delete restrict,
  channel dispatch_channel not null default 'email',
  -- 24 random bytes = 192 bits, 48 hex chars — same generator family as
  -- service_requests.public_token (0013), well over the 32-char minimum.
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  status dispatch_status not null default 'sent',
  eta_at timestamptz,
  vendor_notes text,
  decline_reason text,
  invoice_path text,
  invoice_uploaded_at timestamptz,
  sent_at timestamptz,
  viewed_at timestamptz,
  acknowledged_at timestamptz,
  finished_at timestamptz,
  declined_at timestamptz,
  sla_alerted_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index dispatches_request_idx on dispatches (service_request_id, created_at desc);
create index dispatches_company_status_idx on dispatches (company_id, status);
create index dispatches_vendor_idx on dispatches (vendor_id);
create index dispatches_sla_idx on dispatches (sent_at)
  where sla_alerted_at is null and status in ('sent', 'viewed');

create trigger dispatches_set_updated_at
  before update on dispatches for each row execute function set_updated_at();

comment on column dispatches.token is
  'Unguessable capability token for the vendor''s no-login /v/<token> page. Never returned to the person who filed the request (dispatch_token is is_service_role()-gated in submit_owner_service_request()).';
comment on column dispatches.sent_at is
  'Left null at insert — stamped by mark_dispatch_sent() once the API route has actually sent the email.';

-- ============================================================================
-- 7. staff_badges (table only — Phase 2 UI, no RPC, no anon grant)
-- ============================================================================

create table staff_badges (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  display_name text not null,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  revoked_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index staff_badges_company_idx on staff_badges (company_id) where revoked_at is null;

comment on table staff_badges is
  'Magic-link staff badge tokens. Table only in Phase 1 — no RPC reads or writes this table, no UI, no anon grant.';

-- ============================================================================
-- 8. equipment_access (empty, inert — Model B's bridge table)
-- ============================================================================

create table equipment_access (
  equipment_id uuid not null references equipment(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  relationship equipment_relationship not null,
  granted_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (equipment_id, company_id)
);

create index equipment_access_company_idx on equipment_access (company_id, relationship);

comment on table equipment_access is
  'Model B bridge table (unbuilt). Gets a SELECT policy and nothing else: no insert/update/delete policy, no RPC writes it, and no other policy in this database references it. Must stay empty.';

-- ============================================================================
-- 9. site_pin_passes
-- ============================================================================

create table site_pin_passes (
  token text primary key default encode(gen_random_bytes(24), 'hex'),
  company_id uuid not null references companies(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  last_used_at timestamptz
);

create index site_pin_passes_location_idx on site_pin_passes (location_id, expires_at);

comment on table site_pin_passes is
  'Opaque, expiring, revocable pass a device holds after verify_site_pin() confirms it knows a location''s site PIN. The pass has no derivable relationship to the PIN''s value — the browser stores this, never the PIN.';

-- ============================================================================
-- 10. Constraint edits: request_activity gains the 'dispatch' kind / 'vendor' author
-- ============================================================================

alter table request_activity drop constraint if exists request_activity_kind_check;
alter table request_activity add constraint request_activity_kind_check
  check (kind in ('note', 'message', 'status_change', 'assignment', 'priority_change',
                  'email_sent', 'system', 'dispatch'));

alter table request_activity drop constraint if exists request_activity_author_kind_check;
alter table request_activity add constraint request_activity_author_kind_check
  check (author_kind in ('staff', 'customer', 'system', 'vendor'));

-- Note for the security review: the 0022 webhook trigger
-- request_activity_enqueue_webhook() maps kind='dispatch' to a null event
-- type and returns early. It is intentionally NOT extended here — no new
-- webhook event types ship with this build.

-- ============================================================================
-- 11. dispatches_sync_request(): keep service_requests.dispatch_status/_id in sync
-- ============================================================================
--
-- Denormalisation, not a source of truth: service_requests.dispatch_id/
-- dispatch_status always mirror the MOST RECENTLY CREATED dispatch for the
-- request (there is normally at most one, but "Resend to vendor" (WS3) can
-- create a second one after a decline/failure). Fires on insert, delete, and
-- status update so every path that changes a dispatch keeps the parent
-- request's denormalised columns honest.

create or replace function dispatches_sync_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid := coalesce(new.service_request_id, old.service_request_id);
  v_dispatch_id uuid;
  v_status dispatch_status;
begin
  select d.id, d.status
  into v_dispatch_id, v_status
  from dispatches d
  where d.service_request_id = v_request_id
  order by d.created_at desc, d.id desc
  limit 1;

  update service_requests
  set dispatch_id = v_dispatch_id,
      dispatch_status = v_status
  where id = v_request_id
    and (dispatch_id is distinct from v_dispatch_id or dispatch_status is distinct from v_status);

  return null;
end;
$$;

create trigger dispatches_sync_request
  after insert or delete or update of status on dispatches
  for each row execute function dispatches_sync_request();

revoke execute on function dispatches_sync_request() from public, anon, authenticated;

comment on function dispatches_sync_request() is
  'Trigger only — not directly callable. Keeps service_requests.dispatch_id/dispatch_status mirroring the most recently created dispatch for the request.';

-- ============================================================================
-- 12. plan_limits: owner plan rows
-- ============================================================================
--
-- Keep these three rows in sync with `ownerPlans` in src/lib/plans.ts, same
-- rule 0007's comment states for the provider rows.

insert into plan_limits (id, equipment_limit, member_limit, company_kind, max_locations, history_days)
values
  ('free',        10, null, 'equipment_owner', 1,    30),
  ('site',        75, null, 'equipment_owner', 1,    null),
  ('multi_site', 400, null, 'equipment_owner', 5,    null)
on conflict (id) do nothing;

update plan_limits set company_kind = 'service_provider', max_locations = null
where id in ('starter', 'pro', 'business');

-- ============================================================================
-- 13. enforce_equipment_limit(): re-created kind-aware (same name, same trigger)
-- ============================================================================

create or replace function enforce_equipment_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind company_kind;
  v_trial_ends_at timestamptz;
  v_plan_id text;
  v_status text;
  v_trial_active boolean;
  v_floor text;
  v_plan_kind company_kind;
  v_limit int;
  v_count int;
begin
  select c.kind, c.trial_ends_at into v_kind, v_trial_ends_at from companies c where c.id = new.company_id;

  select s.plan_id, s.status into v_plan_id, v_status
  from subscriptions s
  where s.company_id = new.company_id;

  v_trial_active := v_trial_ends_at is not null and v_trial_ends_at > now();
  v_floor := case v_kind when 'equipment_owner' then 'free' else 'starter' end;

  if v_trial_active and coalesce(v_status, '') <> 'active' then
    -- Trial companies get the kind's trial-tier limit (matches
    -- TRIAL_PLAN_BY_KIND in src/lib/plans.ts), regardless of any
    -- stale/incomplete subscription plan_id sitting on the row.
    v_plan_id := case v_kind when 'equipment_owner' then 'site' else 'pro' end;
  elsif coalesce(v_status, '') not in ('active', 'trialing') then
    -- No usable subscription and no active trial: the kind's floor plan.
    v_plan_id := v_floor;
  end if;

  select equipment_limit, company_kind into v_limit, v_plan_kind from plan_limits where id = v_plan_id;

  -- Missing row, or a plan row belonging to the OTHER kind (a stale
  -- plan_id='business' surviving a service_provider -> equipment_owner data
  -- fix, say): fall back to this kind's floor plan rather than either
  -- erroring or enforcing a limit that was never meant for this kind.
  if v_plan_kind is null or v_plan_kind is distinct from v_kind then
    v_plan_id := v_floor;
    select equipment_limit into v_limit from plan_limits where id = v_floor;
  end if;

  select count(*) into v_count from equipment where company_id = new.company_id;

  if v_count >= v_limit then
    raise exception 'EQUIPMENT_LIMIT_REACHED: this company''s plan (%) allows up to % pieces of equipment', v_plan_id, v_limit;
  end if;

  return new;
end;
$$;

-- ============================================================================
-- 14. enforce_location_limit(): new sibling trigger, `before insert on locations`
-- ============================================================================

create or replace function enforce_location_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind company_kind;
  v_trial_ends_at timestamptz;
  v_plan_id text;
  v_status text;
  v_trial_active boolean;
  v_floor text;
  v_plan_kind company_kind;
  v_limit int;
  v_count int;
begin
  select c.kind, c.trial_ends_at into v_kind, v_trial_ends_at from companies c where c.id = new.company_id;

  select s.plan_id, s.status into v_plan_id, v_status
  from subscriptions s
  where s.company_id = new.company_id;

  v_trial_active := v_trial_ends_at is not null and v_trial_ends_at > now();
  v_floor := case v_kind when 'equipment_owner' then 'free' else 'starter' end;

  if v_trial_active and coalesce(v_status, '') <> 'active' then
    v_plan_id := case v_kind when 'equipment_owner' then 'site' else 'pro' end;
  elsif coalesce(v_status, '') not in ('active', 'trialing') then
    v_plan_id := v_floor;
  end if;

  select max_locations, company_kind into v_limit, v_plan_kind from plan_limits where id = v_plan_id;

  -- v_limit legitimately being null (unlimited, e.g. site/multi_site/every
  -- provider plan) must NOT be treated as "row missing" — check company_kind
  -- (never null on a real row) for that instead.
  if v_plan_kind is null or v_plan_kind is distinct from v_kind then
    v_plan_id := v_floor;
    select max_locations into v_limit from plan_limits where id = v_floor;
  end if;

  if v_limit is null then
    return new; -- unlimited on this plan
  end if;

  select count(*) into v_count from locations where company_id = new.company_id;

  if v_count >= v_limit then
    raise exception 'LOCATION_LIMIT_REACHED: this company''s plan (%) allows up to % location(s)', v_plan_id, v_limit;
  end if;

  return new;
end;
$$;

create trigger locations_enforce_limit
  before insert on locations
  for each row execute function enforce_location_limit();

revoke execute on function enforce_location_limit() from public, anon, authenticated;

comment on function enforce_location_limit() is
  'Trigger only — not directly callable. DB-level backstop for the per-plan location limit; the primary UX will live in src/lib/billing.ts (assertCanAddLocation, WS4).';

-- ============================================================================
-- 15. get_company_entitlements(): kind-aware, three new keys, owner never locked
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
  elsif v_is_locked or v_plan_id is null then
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

-- Same signature as 0013/0007 — create or replace keeps its existing grant
-- to `authenticated`. Grants unchanged; restated here per 0018's rule that
-- the file alone should describe who may call it.
grant execute on function get_company_entitlements() to authenticated;

-- ============================================================================
-- 16. get_company_plan_flags(): kind-aware, one new key
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
  elsif v_is_locked or v_plan_id is null then
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
  'Anon-callable (the /e/[qrToken] scan flow has no staff session). Deliberately returns nothing sensitive — no counts, no Stripe ids, no location/vendor data.';

-- ============================================================================
-- 17. create_company_and_profile(): 4-arg overload records the chosen kind
-- ============================================================================
--
-- PostgREST resolves overloads by argument name, so a 4th argument WITH a
-- default would make the existing 3-argument call ambiguous. p_kind is text
-- (not the company_kind enum) so PostgREST never has to cast an enum out of
-- JSON; the body validates it itself and raises 22023 on anything else.

create function create_company_and_profile(
  p_company_name text,
  p_notification_email text,
  p_full_name text,
  p_kind text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_slug text;
  v_kind company_kind;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated';
  end if;

  if p_kind not in ('service_provider', 'equipment_owner') then
    raise exception 'Invalid company kind: %', p_kind using errcode = '22023';
  end if;
  v_kind := p_kind::company_kind;

  -- Idempotent: see the identical comment in the 0007 body this is copied from.
  select company_id into v_company_id from profiles where id = auth.uid();
  if v_company_id is not null then
    return v_company_id;
  end if;

  v_slug := lower(regexp_replace(p_company_name, '[^a-zA-Z0-9]+', '-', 'g'))
    || '-' || substr(md5(random()::text), 1, 6);

  insert into companies (name, slug, notification_email, trial_ends_at, kind)
  values (p_company_name, v_slug, p_notification_email, now() + interval '14 days', v_kind)
  returning id into v_company_id;

  insert into profiles (id, company_id, full_name, role)
  values (auth.uid(), v_company_id, p_full_name, 'owner')
  on conflict (id) do nothing;

  if not found then
    select company_id into v_company_id from profiles where id = auth.uid();
  end if;

  return v_company_id;
end;
$$;

-- Existing 3-arg call: unchanged behaviour, delegates to the 4-arg body.
create or replace function create_company_and_profile(
  p_company_name text,
  p_notification_email text,
  p_full_name text
)
returns uuid
language sql
security definer
set search_path = public
as $$
  select create_company_and_profile(p_company_name, p_notification_email, p_full_name, 'service_provider')
$$;

revoke execute on function create_company_and_profile(text, text, text) from public;
grant execute on function create_company_and_profile(text, text, text) to authenticated;

revoke execute on function create_company_and_profile(text, text, text, text) from public;
grant execute on function create_company_and_profile(text, text, text, text) to authenticated;

comment on function create_company_and_profile(text, text, text, text) is
  'Authenticated only. Same idempotency and race handling as the 3-arg version, plus a validated company_kind (22023 on anything other than service_provider/equipment_owner).';

-- ============================================================================
-- 18. Row level security — every new table
-- ============================================================================

alter table locations enable row level security;
alter table vendors enable row level security;
alter table category_default_vendors enable row level security;
alter table dispatches enable row level security;
alter table staff_badges enable row level security;
alter table equipment_access enable row level security;
alter table site_pin_passes enable row level security;

-- locations: any staff manage; owner-only delete.
create policy "Staff view own company locations" on locations
  for select using (company_id = get_my_company_id());
create policy "Staff insert own company locations" on locations
  for insert with check (company_id = get_my_company_id());
create policy "Staff update own company locations" on locations
  for update using (company_id = get_my_company_id()) with check (company_id = get_my_company_id());
create policy "Owners delete own company locations" on locations
  for delete using (company_id = get_my_company_id() and is_company_owner());

-- vendors: same shape as locations.
create policy "Staff view own company vendors" on vendors
  for select using (company_id = get_my_company_id());
create policy "Staff insert own company vendors" on vendors
  for insert with check (company_id = get_my_company_id());
create policy "Staff update own company vendors" on vendors
  for update using (company_id = get_my_company_id()) with check (company_id = get_my_company_id());
create policy "Owners delete own company vendors" on vendors
  for delete using (company_id = get_my_company_id() and is_company_owner());

-- category_default_vendors: any staff manage, but insert/update must also
-- prove vendor_id and equipment_type_id belong to the caller's own company —
-- neither FK is tenant-constrained, and resolve_qr_code() publishes an
-- equipment type's whole guide graph publicly (same shape as the 0019
-- `inspections` insert policy).
create policy "Staff view own category defaults" on category_default_vendors
  for select using (company_id = get_my_company_id());
create policy "Staff insert own category defaults" on category_default_vendors
  for insert with check (
    company_id = get_my_company_id()
    and exists (
      select 1 from vendors v
      where v.id = category_default_vendors.vendor_id and v.company_id = get_my_company_id()
    )
    and exists (
      select 1 from equipment_types et
      where et.id = category_default_vendors.equipment_type_id and et.company_id = get_my_company_id()
    )
  );
create policy "Staff update own category defaults" on category_default_vendors
  for update using (company_id = get_my_company_id())
  with check (
    company_id = get_my_company_id()
    and exists (
      select 1 from vendors v
      where v.id = category_default_vendors.vendor_id and v.company_id = get_my_company_id()
    )
    and exists (
      select 1 from equipment_types et
      where et.id = category_default_vendors.equipment_type_id and et.company_id = get_my_company_id()
    )
  );
create policy "Staff delete own category defaults" on category_default_vendors
  for delete using (company_id = get_my_company_id());

-- dispatches: read-only for staff. Rows are created/updated only by the
-- SECURITY DEFINER RPCs in 0025_owner_rpcs.sql — no insert/update/delete
-- policy exists on purpose.
create policy "Staff view own company dispatches" on dispatches
  for select using (company_id = get_my_company_id());

-- staff_badges: any staff manage; owner-only delete (table only, no RPC/UI
-- in this build, but RLS ships now so Phase 2 needs no migration for it).
create policy "Staff view own company staff badges" on staff_badges
  for select using (company_id = get_my_company_id());
create policy "Staff insert own company staff badges" on staff_badges
  for insert with check (company_id = get_my_company_id());
create policy "Staff update own company staff badges" on staff_badges
  for update using (company_id = get_my_company_id()) with check (company_id = get_my_company_id());
create policy "Owners delete own company staff badges" on staff_badges
  for delete using (company_id = get_my_company_id() and is_company_owner());

-- equipment_access: SELECT only, nothing else — see the comment on the table.
create policy "Staff view own company equipment access" on equipment_access
  for select using (company_id = get_my_company_id());

-- site_pin_passes: SELECT only — every row is written by verify_site_pin()
-- (SECURITY DEFINER) and stamped by submit_owner_service_request().
create policy "Staff view own company site pin passes" on site_pin_passes
  for select using (company_id = get_my_company_id());

-- ============================================================================
-- Note on grants (0018's rule): tables get no new GRANT statements — the
-- shim/Supabase default privileges plus the RLS policies above are what
-- scope staff access. Every function created above already states its own
-- grants immediately after its definition.
-- ============================================================================
