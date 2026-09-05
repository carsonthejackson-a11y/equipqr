-- local-db: no-transaction
--
-- "Now" roadmap foundation (see claude/feature-audit-2026-09.md in the
-- EquipQR project). One additive, backward-compatible migration that lays the
-- schema for every Now feature and leaves hooks for the Next ones, so those
-- can attach without rewriting what ships here:
--
--   1. companies      — branding (logo, color), public phone / SMS number,
--                       timezone (scheduling-lite + PM reminders later).
--   2. api_keys       — Business "data export & API access".
--   3. qr_codes       — short_code (8-char human-readable, also the URL token
--                       for new codes), lifecycle status (active / retired /
--                       replaced), replaced_by, "codes never break".
--   4. equipment v2   — make / model / install date / warranty / status /
--                       notes / photo / last & next service dates / custom
--                       fields (jsonb, for the Next "custom fields" feature).
--   5. equipment_documents — manuals, invoices, etc. per unit.
--   6. equipment_events    — the service-history timeline (append-only).
--   7. service_requests    — priority, assignment, more statuses, public
--                       status-page token, scheduled_for (scheduling-lite),
--                       customer_id denormalised at submit time.
--   8. request_activity    — internal notes today; customer-visible messages
--                       (two-way messaging) and system audit rows share it.
--   9. rate_limits    — fixed-window counters for the public API routes.
--  10. scan_events    — source column (qr / short_code / link).
--  11. RPC updates    — resolve_qr_code (short codes, lifecycle, branding,
--                       equipment v2 fields), submit_service_request (events,
--                       public token, customer id), plus new RPCs:
--                       get_request_status (public /r/<token> page),
--                       check_rate_limit, retire/replace/reassign code.
--
-- Nothing is dropped or renamed. Every existing token, sticker and URL keeps
-- resolving. The `-- local-db: no-transaction` header is only for the local
-- runner: `alter type ... add value` values can't be used inside the same
-- transaction that adds them, and this file both adds request_status values
-- and references them in a CHECK further down.

create extension if not exists "pgcrypto";

-- ============================================================================
-- 1. companies: branding + public contact + timezone
-- ============================================================================

alter table companies
  add column if not exists logo_path text,
  add column if not exists brand_color text
    check (brand_color is null or brand_color ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists phone text,
  add column if not exists sms_number text,
  add column if not exists website text,
  add column if not exists timezone text not null default 'America/Chicago',
  add column if not exists customer_updates_enabled boolean not null default true;

comment on column companies.logo_path is
  'Object path in the public "company-assets" storage bucket (Pro+ branding).';
comment on column companies.phone is
  'Shown on customer-facing scan pages as the "Call us" button when set.';
comment on column companies.sms_number is
  'Shown on customer-facing scan pages as the "Text us" button when set.';
comment on column companies.customer_updates_enabled is
  'When true, requesters who left an email get status-change emails with a link to /r/<token>.';

-- Public bucket for things anonymous customers legitimately see: company
-- logos and equipment photos. Documents (manuals, invoices) stay private in
-- equipment-files below.
insert into storage.buckets (id, name, public)
values ('company-assets', 'company-assets', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('equipment-files', 'equipment-files', false)
on conflict (id) do nothing;

-- Object names are "<company_id>/..." so ownership is checkable from the path
-- alone, without a lookup table per bucket.
create policy "Staff upload own company assets"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id in ('company-assets', 'equipment-files')
    and split_part(name, '/', 1) = get_my_company_id()::text
  );

create policy "Staff update own company assets"
  on storage.objects for update
  to authenticated
  using (
    bucket_id in ('company-assets', 'equipment-files')
    and split_part(name, '/', 1) = get_my_company_id()::text
  );

create policy "Staff delete own company assets"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id in ('company-assets', 'equipment-files')
    and split_part(name, '/', 1) = get_my_company_id()::text
  );

create policy "Staff read own private equipment files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'equipment-files'
    and split_part(name, '/', 1) = get_my_company_id()::text
  );

create policy "Anyone can read public company assets"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'company-assets');

-- ============================================================================
-- 2. api_keys: Business plan "data export & API access"
-- ============================================================================

create table api_keys (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  -- First 12 chars of the plaintext key (e.g. "eqr_live_a1b2"), for display.
  key_prefix text not null,
  -- sha256 hex of the full plaintext key. The plaintext is shown exactly once.
  key_hash text not null unique,
  scopes text[] not null default '{read}',
  created_by uuid references auth.users(id) on delete set null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index api_keys_company_id_idx on api_keys (company_id);
create index api_keys_created_by_idx on api_keys (created_by);

alter table api_keys enable row level security;

create policy "Owners view own company api keys" on api_keys
  for select using (company_id = get_my_company_id() and is_company_owner());

create policy "Owners insert own company api keys" on api_keys
  for insert with check (company_id = get_my_company_id() and is_company_owner());

create policy "Owners update own company api keys" on api_keys
  for update using (company_id = get_my_company_id() and is_company_owner())
  with check (company_id = get_my_company_id() and is_company_owner());

create policy "Owners delete own company api keys" on api_keys
  for delete using (company_id = get_my_company_id() and is_company_owner());

-- Resolves a presented key (already sha256-hashed by the caller) to its
-- company. Called from /api/v1/* route handlers via the service-role client,
-- never from the browser. Stamps last_used_at as a side effect.
create or replace function resolve_api_key(p_key_hash text)
returns table (company_id uuid, scopes text[])
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key api_keys%rowtype;
begin
  select * into v_key from api_keys k where k.key_hash = p_key_hash and k.revoked_at is null;
  if not found then
    return;
  end if;

  update api_keys set last_used_at = now() where id = v_key.id;

  return query select v_key.company_id, v_key.scopes;
end;
$$;

revoke execute on function resolve_api_key(text) from public, anon, authenticated;
grant execute on function resolve_api_key(text) to service_role;

-- ============================================================================
-- 3. qr_codes: short codes + lifecycle
-- ============================================================================

alter table qr_codes
  -- 8 chars from the same unambiguous alphabet generate_qr_code_batch() uses
  -- (no 0/O/1/I/L). Stored WITHOUT the dash; format as XXXX-XXXX for humans.
  add column if not exists short_code text,
  add column if not exists status text not null default 'active'
    check (status in ('active', 'retired', 'replaced')),
  add column if not exists replaced_by_id uuid references qr_codes(id) on delete set null,
  add column if not exists retired_at timestamptz,
  add column if not exists label_printed_at timestamptz;

-- Backfill short codes for every existing row. Batch codes already ARE short
-- codes ("AB3D-9F2K" -> "AB3D9F2K"); instant codes get a fresh one.
create or replace function generate_short_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  i int;
begin
  loop
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from qr_codes where short_code = v_code)
      and not exists (select 1 from qr_codes where token = v_code);
  end loop;
  return v_code;
end;
$$;

revoke execute on function generate_short_code() from public, anon;

update qr_codes
set short_code = upper(replace(token, '-', ''))
where short_code is null and source = 'batch' and length(replace(token, '-', '')) = 8;

do $$
declare
  r record;
begin
  for r in select id from qr_codes where short_code is null loop
    update qr_codes set short_code = generate_short_code() where id = r.id;
  end loop;
end $$;

alter table qr_codes alter column short_code set not null;
alter table qr_codes alter column short_code set default generate_short_code();
create unique index qr_codes_short_code_idx on qr_codes (short_code);

-- One ACTIVE code per unit. A replaced code keeps pointing at its unit (so a
-- sticker that's still physically attached keeps working — "codes never
-- break"), which the old hard UNIQUE (equipment_id) constraint forbade.
alter table qr_codes drop constraint if exists qr_codes_equipment_unique;
create unique index qr_codes_one_active_per_equipment
  on qr_codes (equipment_id) where status = 'active' and equipment_id is not null;

create index qr_codes_replaced_by_id_idx on qr_codes (replaced_by_id);

-- Staff can now change lifecycle fields on their own codes (retire / replace /
-- reassign go through RPCs below, but label_printed_at is a plain update).
create policy "Staff update own company qr codes" on qr_codes
  for update using (company_id = get_my_company_id())
  with check (company_id = get_my_company_id());

-- Normalises anything a human typed or scanned into the short-code form:
-- uppercase, strip everything but A-Z and 2-9. Returns null when it can't be
-- an 8-char short code, so callers can fall through to the raw token lookup.
create or replace function normalize_short_code(p_input text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when length(regexp_replace(upper(coalesce(p_input, '')), '[^A-Z0-9]', '', 'g')) = 8
      then regexp_replace(upper(p_input), '[^A-Z0-9]', '', 'g')
    else null
  end
$$;

-- Single lookup used by every public entry point: exact token match first
-- (legacy 24-hex and batch "XXXX-XXXX" tokens), then the short code.
create or replace function find_qr_code(p_input text)
returns qr_codes
language sql
stable
security definer
set search_path = public
as $$
  select * from qr_codes
  where token = p_input
     or short_code = normalize_short_code(p_input)
  order by (token = p_input) desc
  limit 1
$$;

revoke execute on function find_qr_code(text) from public, anon, authenticated;

-- ============================================================================
-- 4. equipment v2
-- ============================================================================

alter table equipment
  add column if not exists make text,
  add column if not exists model text,
  add column if not exists install_date date,
  add column if not exists warranty_ends_on date,
  add column if not exists status text not null default 'active'
    check (status in ('active', 'needs_service', 'out_of_service', 'retired')),
  add column if not exists notes text,
  add column if not exists photo_path text,
  add column if not exists last_serviced_at timestamptz,
  -- Next: PM reminders. Time-based schedules will write this; usage-based
  -- later. Nullable + unused by the app until then.
  add column if not exists next_service_due_on date,
  -- Next: custom fields. Key/value per company-defined field id.
  add column if not exists custom_fields jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

comment on column equipment.photo_path is
  'Object path in the public "company-assets" bucket; shown on the customer scan page.';

create index equipment_status_idx on equipment (company_id, status);
create index equipment_warranty_ends_on_idx on equipment (company_id, warranty_ends_on);
create index equipment_next_service_due_on_idx on equipment (company_id, next_service_due_on);

create or replace function set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function set_updated_at() from public, anon, authenticated;

create trigger equipment_set_updated_at
  before update on equipment
  for each row execute function set_updated_at();

-- ============================================================================
-- 5. equipment_documents
-- ============================================================================

create table equipment_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  equipment_id uuid not null references equipment(id) on delete cascade,
  -- Object path in the private "equipment-files" bucket.
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index equipment_documents_equipment_id_idx on equipment_documents (equipment_id);
create index equipment_documents_company_id_idx on equipment_documents (company_id);
create index equipment_documents_uploaded_by_idx on equipment_documents (uploaded_by);

alter table equipment_documents enable row level security;

create policy "Staff view own equipment documents" on equipment_documents
  for select using (company_id = get_my_company_id());

create policy "Staff insert own equipment documents" on equipment_documents
  for insert with check (company_id = get_my_company_id());

create policy "Staff delete own equipment documents" on equipment_documents
  for delete using (company_id = get_my_company_id());

-- ============================================================================
-- 6. equipment_events: service-history timeline
-- ============================================================================
--
-- Append-only. Every "something happened to this unit" lands here, from
-- staff actions, customer scans/requests, and (later) scheduled visits,
-- inspections, PM reminders and webhooks. Kinds are free text on purpose —
-- new features add kinds without a migration — but the app keeps the
-- canonical list in src/lib/events.ts.

create table equipment_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  equipment_id uuid not null references equipment(id) on delete cascade,
  kind text not null,
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  service_request_id uuid references service_requests(id) on delete set null,
  actor_kind text not null default 'system' check (actor_kind in ('staff', 'customer', 'system')),
  actor_user_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index equipment_events_equipment_id_occurred_idx on equipment_events (equipment_id, occurred_at desc);
create index equipment_events_company_id_idx on equipment_events (company_id);
create index equipment_events_service_request_id_idx on equipment_events (service_request_id);
create index equipment_events_actor_user_id_idx on equipment_events (actor_user_id);

alter table equipment_events enable row level security;

create policy "Staff view own equipment events" on equipment_events
  for select using (company_id = get_my_company_id());

-- Staff may append (notes, manual service entries). No update/delete —
-- the timeline is an audit trail. Public-side rows are written by the
-- security definer RPCs below.
create policy "Staff insert own equipment events" on equipment_events
  for insert with check (company_id = get_my_company_id());

-- Backfill: a "created" event per unit, and request events for history.
insert into equipment_events (company_id, equipment_id, kind, summary, actor_kind, occurred_at, created_at)
select company_id, id, 'equipment_created', 'Equipment added', 'system', created_at, created_at
from equipment;

insert into equipment_events (company_id, equipment_id, kind, summary, service_request_id, actor_kind, occurred_at, created_at)
select company_id, equipment_id, 'request_submitted',
       'Service request submitted by ' || contact_name, id, 'customer', created_at, created_at
from service_requests;

insert into equipment_events (company_id, equipment_id, kind, summary, details, service_request_id, actor_kind, occurred_at, created_at)
select company_id, equipment_id, 'request_resolved',
       'Service request resolved',
       jsonb_build_object('resolution_summary', resolution_summary),
       id, 'staff', coalesce(resolved_at, created_at), coalesce(resolved_at, created_at)
from service_requests
where status = 'resolved';

-- last_serviced_at from history.
update equipment e
set last_serviced_at = sub.last_resolved
from (
  select equipment_id, max(resolved_at) as last_resolved
  from service_requests
  where status = 'resolved' and resolved_at is not null
  group by equipment_id
) sub
where sub.equipment_id = e.id;

-- ============================================================================
-- 7. service_requests: workflow v2
-- ============================================================================

-- New statuses. Existing rows keep new / in_progress / resolved.
alter type request_status add value if not exists 'scheduled' after 'in_progress';
alter type request_status add value if not exists 'on_hold' after 'scheduled';
alter type request_status add value if not exists 'canceled' after 'resolved';

alter table service_requests
  add column if not exists priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  add column if not exists assigned_to uuid references profiles(id) on delete set null,
  add column if not exists assigned_at timestamptz,
  -- Denormalised from equipment at submit time so requests survive a unit
  -- being moved between customers and so lists can filter without a join.
  add column if not exists customer_id uuid references customers(id) on delete set null,
  -- Unguessable token for the customer's /r/<token> status page.
  add column if not exists public_token text unique default encode(gen_random_bytes(16), 'hex'),
  add column if not exists status_updated_at timestamptz not null default now(),
  -- Next: scheduling-lite. A visit date the customer can see on /r/<token>.
  add column if not exists scheduled_for timestamptz,
  add column if not exists closed_by uuid references profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

update service_requests
set public_token = encode(gen_random_bytes(16), 'hex')
where public_token is null;

alter table service_requests alter column public_token set not null;

update service_requests sr
set customer_id = e.customer_id
from equipment e
where e.id = sr.equipment_id and sr.customer_id is null;

create index service_requests_assigned_to_idx on service_requests (assigned_to);
create index service_requests_customer_id_idx on service_requests (customer_id);
create index service_requests_priority_idx on service_requests (company_id, priority);
create index service_requests_closed_by_idx on service_requests (closed_by);
create index service_requests_scheduled_for_idx on service_requests (company_id, scheduled_for);

create trigger service_requests_set_updated_at
  before update on service_requests
  for each row execute function set_updated_at();

-- Keep status_updated_at honest regardless of which code path changes status.
create or replace function service_requests_track_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    new.status_updated_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function service_requests_track_status() from public, anon, authenticated;

create trigger service_requests_track_status
  before update on service_requests
  for each row execute function service_requests_track_status();

-- ============================================================================
-- 8. request_activity: notes, messages, and audit rows on a request
-- ============================================================================
--
-- visibility = 'internal' rows are staff-only (internal notes, audit).
-- visibility = 'customer' rows show on the public /r/<token> page and, when
-- two-way messaging ships (Next), are what the customer replies to.

create table request_activity (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  service_request_id uuid not null references service_requests(id) on delete cascade,
  kind text not null default 'note'
    check (kind in ('note', 'message', 'status_change', 'assignment', 'priority_change', 'email_sent', 'system')),
  visibility text not null default 'internal' check (visibility in ('internal', 'customer')),
  body text,
  metadata jsonb not null default '{}'::jsonb,
  author_kind text not null default 'staff' check (author_kind in ('staff', 'customer', 'system')),
  author_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index request_activity_request_id_created_idx on request_activity (service_request_id, created_at);
create index request_activity_company_id_idx on request_activity (company_id);
create index request_activity_author_user_id_idx on request_activity (author_user_id);

alter table request_activity enable row level security;

create policy "Staff view own request activity" on request_activity
  for select using (company_id = get_my_company_id());

create policy "Staff insert own request activity" on request_activity
  for insert with check (company_id = get_my_company_id());

-- Authors can edit/delete their own notes only (not audit rows).
create policy "Authors update own notes" on request_activity
  for update using (company_id = get_my_company_id() and author_user_id = (select auth.uid()) and kind = 'note')
  with check (company_id = get_my_company_id() and author_user_id = (select auth.uid()) and kind = 'note');

create policy "Authors delete own notes" on request_activity
  for delete using (company_id = get_my_company_id() and author_user_id = (select auth.uid()) and kind = 'note');

-- ============================================================================
-- 9. rate_limits: fixed-window counters for public routes
-- ============================================================================

create table rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count int not null default 0
);

alter table rate_limits enable row level security;
-- No policies: only check_rate_limit() (security definer) touches this table.

-- Returns true when the call is allowed, false when over the limit. Atomic
-- upsert so concurrent requests can't both slip under the limit.
create or replace function check_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into rate_limits (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update
    set count = case
          when rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then 1
          else rate_limits.count + 1
        end,
        window_start = case
          when rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then now()
          else rate_limits.window_start
        end
  returning count into v_count;

  -- Opportunistic cleanup so the table never grows unbounded.
  if random() < 0.01 then
    delete from rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_count <= p_limit;
end;
$$;

revoke execute on function check_rate_limit(text, int, int) from public;
grant execute on function check_rate_limit(text, int, int) to anon, authenticated;

-- ============================================================================
-- 10. scan_events: how the visitor arrived
-- ============================================================================

alter table scan_events
  add column if not exists source text not null default 'qr'
    check (source in ('qr', 'short_code', 'link'));

create or replace function record_scan(p_qr_token text, p_user_agent text default null, p_source text default 'qr')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code qr_codes;
begin
  v_code := find_qr_code(p_qr_token);

  if v_code.id is null then
    return;
  end if;

  insert into scan_events (qr_code_id, company_id, equipment_id, user_agent, source)
  values (v_code.id, v_code.company_id, v_code.equipment_id, p_user_agent,
          case when p_source in ('qr', 'short_code', 'link') then p_source else 'qr' end);
end;
$$;

revoke execute on function record_scan(text, text, text) from public;
grant execute on function record_scan(text, text, text) to anon, authenticated;

-- The 2-arg overload from 0009 is superseded; drop it so there is one entry point.
drop function if exists public.record_scan(text, text);

-- ============================================================================
-- 11a. resolve_qr_code: short codes, lifecycle, branding, equipment v2
-- ============================================================================

create or replace function resolve_qr_code(p_token text)
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_code qr_codes;
  v_guide json;
begin
  v_code := find_qr_code(p_token);

  if v_code.id is null then
    return json_build_object('status', 'not_found');
  end if;

  -- Retired with no unit behind it any more (unit deleted, or the code was
  -- retired without a replacement): tell the customer to contact the company.
  if v_code.equipment_id is null and v_code.status <> 'active' then
    return json_build_object(
      'status', 'retired',
      'company_id', v_code.company_id
    );
  end if;

  if v_code.equipment_id is null then
    return json_build_object(
      'status', 'unclaimed',
      'company_id', v_code.company_id
    );
  end if;

  select json_build_object(
    'equipment', json_build_object(
      'id', e.id,
      'name', e.name,
      'make', e.make,
      'model', e.model,
      'location', e.location,
      'status', e.status,
      'photo_path', e.photo_path,
      'last_serviced_at', e.last_serviced_at
    ),
    'company', json_build_object(
      'id', c.id,
      'name', c.name,
      'phone', c.phone,
      'sms_number', c.sms_number,
      'website', c.website,
      'logo_path', c.logo_path,
      'brand_color', c.brand_color
    ),
    'equipment_type', json_build_object('id', et.id, 'name', et.name, 'description', et.description),
    'code', json_build_object(
      'short_code', v_code.short_code,
      'status', v_code.status
    ),
    'root_step_id', (select id from guide_steps where equipment_type_id = et.id and is_root limit 1),
    'steps', coalesce((
      select json_agg(json_build_object(
        'id', gs.id,
        'title', gs.title,
        'instructions', gs.instructions,
        'media_url', gs.media_url,
        'is_root', gs.is_root,
        'options', coalesce((
          select json_agg(json_build_object(
            'id', go.id,
            'label', go.label,
            'outcome', go.outcome,
            'next_step_id', go.next_step_id
          ) order by go.sort_order)
          from guide_options go
          where go.guide_step_id = gs.id
        ), '[]'::json)
      ))
      from guide_steps gs
      where gs.equipment_type_id = et.id
    ), '[]'::json)
  )
  into v_guide
  from equipment e
  join companies c on c.id = e.company_id
  join equipment_types et on et.id = e.equipment_type_id
  where e.id = v_code.equipment_id;

  return json_build_object('status', 'claimed', 'guide', v_guide);
end;
$$;

-- ============================================================================
-- 11b. submit_service_request: events, public token, customer id, priority
-- ============================================================================

drop function if exists public.submit_service_request(text, text, text, text, text, jsonb, jsonb);

create or replace function submit_service_request(
  p_qr_token text,
  p_description text,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_media jsonb default '[]'::jsonb,
  p_troubleshooting_path jsonb default '[]'::jsonb,
  p_priority text default 'normal'
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code qr_codes;
  v_equipment equipment;
  v_request_id uuid;
  v_public_token text;
  v_item jsonb;
  v_result json;
  v_priority text;
begin
  v_code := find_qr_code(p_qr_token);

  if v_code.id is null or v_code.equipment_id is null then
    raise exception 'Unknown equipment';
  end if;

  select * into v_equipment from equipment where id = v_code.equipment_id;

  v_priority := case when p_priority in ('low', 'normal', 'high', 'urgent') then p_priority else 'normal' end;

  insert into service_requests (
    equipment_id, company_id, customer_id, description, contact_name, contact_email, contact_phone,
    troubleshooting_path, priority
  )
  values (
    v_equipment.id, v_equipment.company_id, v_equipment.customer_id, p_description, p_contact_name,
    nullif(p_contact_email, ''), nullif(p_contact_phone, ''), p_troubleshooting_path, v_priority
  )
  returning id, public_token into v_request_id, v_public_token;

  for v_item in select * from jsonb_array_elements(p_media)
  loop
    insert into service_request_media (service_request_id, storage_path, media_type)
    values (v_request_id, v_item->>'storage_path', (v_item->>'media_type')::media_kind);
  end loop;

  insert into equipment_events (company_id, equipment_id, kind, summary, details, service_request_id, actor_kind)
  values (
    v_equipment.company_id, v_equipment.id, 'request_submitted',
    'Service request submitted by ' || p_contact_name,
    jsonb_build_object('priority', v_priority, 'media_count', jsonb_array_length(p_media)),
    v_request_id, 'customer'
  );

  insert into request_activity (company_id, service_request_id, kind, visibility, body, author_kind)
  values (v_equipment.company_id, v_request_id, 'status_change', 'customer', 'Request received', 'system');

  select json_build_object(
    'request_id', v_request_id,
    'public_token', v_public_token,
    'company_id', c.id,
    'company_name', c.name,
    'company_notification_email', c.notification_email,
    'company_phone', c.phone,
    'company_logo_path', c.logo_path,
    'company_brand_color', c.brand_color,
    'customer_updates_enabled', c.customer_updates_enabled,
    'equipment_name', e.name
  )
  into v_result
  from equipment e
  join companies c on c.id = e.company_id
  where e.id = v_equipment.id;

  return v_result;
end;
$$;

revoke execute on function submit_service_request(text, text, text, text, text, jsonb, jsonb, text) from public;
grant execute on function submit_service_request(text, text, text, text, text, jsonb, jsonb, text) to anon, authenticated;

-- ============================================================================
-- 11c. get_request_status: public /r/<token> status page
-- ============================================================================
--
-- Deliberately exposes only what the requester already knows or needs:
-- status, the unit's name, the company's name/branding/phone, customer-
-- visible activity, and the close-out summary once resolved. No ids, no
-- internal notes, no other requests.

create or replace function get_request_status(p_public_token text)
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_result json;
begin
  select json_build_object(
    'status', sr.status,
    'priority', sr.priority,
    'created_at', sr.created_at,
    'status_updated_at', sr.status_updated_at,
    'scheduled_for', sr.scheduled_for,
    'resolved_at', sr.resolved_at,
    'resolution_summary', sr.resolution_summary,
    'resolution_recommendations', sr.resolution_recommendations,
    'contact_name', sr.contact_name,
    'description', sr.description,
    'equipment', json_build_object('name', e.name, 'location', e.location),
    'company', json_build_object(
      'name', c.name,
      'phone', c.phone,
      'sms_number', c.sms_number,
      'logo_path', c.logo_path,
      'brand_color', c.brand_color
    ),
    'assigned_to_name', (select p.full_name from profiles p where p.id = sr.assigned_to),
    'activity', coalesce((
      select json_agg(json_build_object(
        'kind', ra.kind,
        'body', ra.body,
        'author_kind', ra.author_kind,
        'created_at', ra.created_at
      ) order by ra.created_at)
      from request_activity ra
      where ra.service_request_id = sr.id and ra.visibility = 'customer'
    ), '[]'::json)
  )
  into v_result
  from service_requests sr
  join equipment e on e.id = sr.equipment_id
  join companies c on c.id = sr.company_id
  where sr.public_token = p_public_token;

  return v_result; -- null when the token is unknown
end;
$$;

revoke execute on function get_request_status(text) from public;
grant execute on function get_request_status(text) to anon, authenticated;

-- ============================================================================
-- 11d. QR lifecycle RPCs (staff)
-- ============================================================================

-- Retire: the code stops resolving to the unit (sticker lost / unit gone).
create or replace function retire_qr_code(p_code_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code qr_codes;
begin
  select * into v_code from qr_codes where id = p_code_id and company_id = get_my_company_id();
  if not found then
    raise exception 'Code not found';
  end if;

  update qr_codes
  set status = 'retired', retired_at = now(), equipment_id = null
  where id = p_code_id;

  if v_code.equipment_id is not null then
    insert into equipment_events (company_id, equipment_id, kind, summary, details, actor_kind, actor_user_id)
    values (v_code.company_id, v_code.equipment_id, 'code_retired',
            'QR code ' || v_code.short_code || ' retired',
            jsonb_build_object('qr_code_id', v_code.id, 'short_code', v_code.short_code),
            'staff', auth.uid());
  end if;
end;
$$;

revoke execute on function retire_qr_code(uuid) from public, anon;
grant execute on function retire_qr_code(uuid) to authenticated;

-- Replace: issue a fresh instant code for the same unit. The old code is
-- marked 'replaced' but KEEPS its equipment_id, so an old sticker still
-- resolves ("codes never break"). Returns the new code row.
create or replace function replace_qr_code(p_code_id uuid)
returns qr_codes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old qr_codes;
  v_new qr_codes;
  v_short text;
begin
  select * into v_old from qr_codes where id = p_code_id and company_id = get_my_company_id();
  if not found then
    raise exception 'Code not found';
  end if;
  if v_old.equipment_id is null then
    raise exception 'This code is not linked to any equipment';
  end if;

  update qr_codes set status = 'replaced' where id = v_old.id;

  v_short := generate_short_code();
  insert into qr_codes (token, short_code, company_id, equipment_id, source, claimed_at, status)
  values (v_short, v_short, v_old.company_id, v_old.equipment_id, 'instant', now(), 'active')
  returning * into v_new;

  update qr_codes set replaced_by_id = v_new.id where id = v_old.id;

  insert into equipment_events (company_id, equipment_id, kind, summary, details, actor_kind, actor_user_id)
  values (v_old.company_id, v_old.equipment_id, 'code_replaced',
          'QR code ' || v_old.short_code || ' replaced by ' || v_new.short_code,
          jsonb_build_object('old_qr_code_id', v_old.id, 'new_qr_code_id', v_new.id),
          'staff', auth.uid());

  return v_new;
end;
$$;

revoke execute on function replace_qr_code(uuid) from public, anon;
grant execute on function replace_qr_code(uuid) to authenticated;

-- Reassign: move an active code to a different unit of the same company
-- (e.g. sticker was put on the wrong machine). Fails if the target already
-- has an active code.
create or replace function reassign_qr_code(p_code_id uuid, p_equipment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code qr_codes;
  v_company_id uuid := get_my_company_id();
begin
  select * into v_code from qr_codes where id = p_code_id and company_id = v_company_id;
  if not found then
    raise exception 'Code not found';
  end if;
  if not exists (select 1 from equipment where id = p_equipment_id and company_id = v_company_id) then
    raise exception 'Equipment not found';
  end if;
  if exists (select 1 from qr_codes where equipment_id = p_equipment_id and status = 'active' and id <> p_code_id) then
    raise exception 'That equipment already has an active QR code';
  end if;

  update qr_codes
  set equipment_id = p_equipment_id, status = 'active', claimed_at = now(), retired_at = null
  where id = p_code_id;

  if v_code.equipment_id is not null and v_code.equipment_id <> p_equipment_id then
    insert into equipment_events (company_id, equipment_id, kind, summary, details, actor_kind, actor_user_id)
    values (v_company_id, v_code.equipment_id, 'code_reassigned',
            'QR code ' || v_code.short_code || ' moved to another unit',
            jsonb_build_object('qr_code_id', v_code.id, 'to_equipment_id', p_equipment_id),
            'staff', auth.uid());
  end if;

  insert into equipment_events (company_id, equipment_id, kind, summary, details, actor_kind, actor_user_id)
  values (v_company_id, p_equipment_id, 'code_assigned',
          'QR code ' || v_code.short_code || ' assigned',
          jsonb_build_object('qr_code_id', v_code.id, 'from_equipment_id', v_code.equipment_id),
          'staff', auth.uid());
end;
$$;

revoke execute on function reassign_qr_code(uuid, uuid) from public, anon;
grant execute on function reassign_qr_code(uuid, uuid) to authenticated;

-- claim_qr_code (batch pool): only unclaimed ACTIVE codes may be claimed.
create or replace function claim_qr_code(p_token text, p_equipment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_code qr_codes;
begin
  v_company_id := get_my_company_id();

  if v_company_id is null then
    raise exception 'Must be authenticated';
  end if;

  if not exists (
    select 1 from equipment e where e.id = p_equipment_id and e.company_id = v_company_id
  ) then
    raise exception 'Equipment not found';
  end if;

  if exists (select 1 from qr_codes where equipment_id = p_equipment_id and status = 'active') then
    raise exception 'That equipment already has an active QR code';
  end if;

  update qr_codes
  set equipment_id = p_equipment_id, claimed_at = now()
  where (token = p_token or short_code = normalize_short_code(p_token))
    and company_id = v_company_id
    and equipment_id is null
    and status = 'active'
  returning * into v_code;

  if not found then
    raise exception 'This code is not available to claim';
  end if;

  insert into equipment_events (company_id, equipment_id, kind, summary, details, actor_kind, actor_user_id)
  values (v_company_id, p_equipment_id, 'code_assigned',
          'QR code ' || v_code.short_code || ' assigned',
          jsonb_build_object('qr_code_id', v_code.id, 'source', v_code.source),
          'staff', auth.uid());
end;
$$;

-- generate_qr_code_batch: batch codes now also populate short_code.
create or replace function generate_qr_code_batch(p_company_id uuid, p_count int)
returns setof qr_codes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_short text;
  i int;
begin
  if not is_platform_admin() then
    raise exception 'Not authorized';
  end if;

  if p_count < 1 or p_count > 500 then
    raise exception 'Count must be between 1 and 500';
  end if;

  for i in 1..p_count loop
    v_short := generate_short_code();
    insert into qr_codes (token, short_code, company_id, source)
    values (substr(v_short, 1, 4) || '-' || substr(v_short, 5, 4), v_short, p_company_id, 'batch');
  end loop;

  return query select * from qr_codes where company_id = p_company_id and source = 'batch'
    order by created_at desc limit p_count;
end;
$$;

-- ============================================================================
-- 11e. Equipment-side timeline helpers used by the app
-- ============================================================================

-- Per-machine scan analytics in one call (total, last 30 days, last scan).
create or replace function get_equipment_scan_stats(p_equipment_id uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'total', count(*),
    'last_30_days', count(*) filter (where scanned_at > now() - interval '30 days'),
    'last_7_days', count(*) filter (where scanned_at > now() - interval '7 days'),
    'last_scanned_at', max(scanned_at)
  )
  from scan_events
  where equipment_id = p_equipment_id
    and company_id = get_my_company_id();
$$;

revoke execute on function get_equipment_scan_stats(uuid) from public, anon;
grant execute on function get_equipment_scan_stats(uuid) to authenticated;

-- When a request is resolved, stamp the unit's last_serviced_at and append
-- the timeline event — regardless of which code path resolved it.
create or replace function service_requests_on_resolved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'resolved' and old.status is distinct from 'resolved' then
    if new.resolved_at is null then
      new.resolved_at := now();
    end if;

    update equipment
    set last_serviced_at = greatest(coalesce(last_serviced_at, new.resolved_at), new.resolved_at)
    where id = new.equipment_id;

    insert into equipment_events (company_id, equipment_id, kind, summary, details, service_request_id, actor_kind, actor_user_id, occurred_at)
    values (new.company_id, new.equipment_id, 'request_resolved', 'Service request resolved',
            jsonb_build_object('resolution_summary', new.resolution_summary),
            new.id, 'staff', auth.uid(), new.resolved_at);
  end if;
  return new;
end;
$$;

revoke execute on function service_requests_on_resolved() from public, anon, authenticated;

create trigger service_requests_on_resolved
  before update on service_requests
  for each row execute function service_requests_on_resolved();
