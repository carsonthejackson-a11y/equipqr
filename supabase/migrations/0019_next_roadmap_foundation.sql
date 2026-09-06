-- 0019_next_roadmap_foundation.sql
--
-- Schema contract for the "Next" roadmap (Sept 2026) plus the two scan-page
-- features Carson asked for on top of it:
--
--   1. Staff scan mode — a logged-in technician who scans a sticker sees the
--      unit's open requests and can update status / close out from the phone.
--      (No new RPCs: staff already have RLS access; this migration adds the
--      close-out columns — staff photos + customer signature.)
--   2. Customer open-work-order view — anyone who scans a sticker that has an
--      open request sees its status + customer-visible updates and can add a
--      note instead of filing a duplicate. (resolve_qr_code now returns
--      `open_requests`; add_customer_request_update() is the anon write path.)
--   3. Two-way messaging on a request (customer ↔ staff): `message` activity
--      rows written by customers, unread counter for the inbox.
--   4. Scheduling-lite: duration + reminder / on-my-way stamps.
--   5. Preventive-maintenance schedules → auto-created PM requests.
--   6. Checklist templates + inspections (scan-to-inspect) with photos and a
--      customer signature.
--   7. Scan-to-onboard: owners can mint their own pre-printed code pool.
--
-- Purely additive. Does not edit 0001–0018. No enum values are added (so this
-- can run in a single transaction).

-- ============================================================================
-- 1. service_requests: source, PM link, scheduling-lite, messaging, close-out
-- ============================================================================
alter table service_requests
  add column if not exists source text not null default 'scan'
    check (source in ('scan', 'staff', 'pm', 'api')),
  add column if not exists maintenance_schedule_id uuid,
  add column if not exists inspection_id uuid,
  add column if not exists scheduled_duration_minutes int not null default 60
    check (scheduled_duration_minutes between 5 and 1440),
  add column if not exists reminder_sent_at timestamptz,
  add column if not exists on_my_way_sent_at timestamptz,
  add column if not exists last_customer_message_at timestamptz,
  add column if not exists unread_customer_messages int not null default 0
    check (unread_customer_messages >= 0),
  add column if not exists signature_path text,
  add column if not exists signed_by_name text,
  add column if not exists signed_at timestamptz;

comment on column service_requests.source is
  'scan = customer via sticker; staff = created in the dashboard/scan staff mode; pm = generated from a maintenance schedule; api = /api/v1.';
comment on column service_requests.unread_customer_messages is
  'Incremented by add_customer_request_update(); the dashboard zeroes it when staff open the request.';
comment on column service_requests.signature_path is
  'Customer sign-off image in the private service-request-media bucket, captured at close-out (staff scan mode).';

-- Open requests per unit are looked up on every scan of a claimed sticker.
create index if not exists service_requests_equipment_open_idx
  on service_requests (equipment_id, created_at desc)
  where status in ('new', 'in_progress', 'scheduled', 'on_hold');

-- Cron: visits needing a reminder.
create index if not exists service_requests_reminder_idx
  on service_requests (scheduled_for)
  where status = 'scheduled' and reminder_sent_at is null;

-- ============================================================================
-- 2. service_request_media: staff close-out photos
-- ============================================================================
alter table service_request_media
  add column if not exists origin text not null default 'customer'
    check (origin in ('customer', 'staff')),
  add column if not exists caption text,
  add column if not exists uploaded_by uuid references auth.users(id) on delete set null,
  add column if not exists company_id uuid references companies(id) on delete cascade;

-- Backfill company_id so the new policies can be path-free and cheap.
update service_request_media srm
set company_id = sr.company_id
from service_requests sr
where sr.id = srm.service_request_id and srm.company_id is null;

create index if not exists service_request_media_company_id_idx on service_request_media (company_id);

-- submit_service_request() (0013/0018) inserts media rows without company_id;
-- derive it from the parent request so every row carries it going forward.
create or replace function service_request_media_set_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_id is null then
    select company_id into new.company_id from service_requests where id = new.service_request_id;
  end if;
  return new;
end;
$$;

revoke execute on function service_request_media_set_company() from public, anon, authenticated;

create trigger service_request_media_set_company
  before insert on service_request_media
  for each row execute function service_request_media_set_company();

-- Staff attach before/after photos to a request of their own company.
-- Storage object names for staff uploads are
--   staff/<company_id>/<request_id>/<uuid>.jpg
-- (the anon-upload storage policy from 0001 already allows the object write;
-- the row below is what makes it readable back through the 0001 read policy.)
create policy "Staff insert own company request media" on service_request_media
  for insert to authenticated
  with check (
    origin = 'staff'
    and company_id = get_my_company_id()
    and exists (
      select 1 from service_requests sr
      where sr.id = service_request_media.service_request_id
        and sr.company_id = get_my_company_id()
    )
  );

create policy "Staff delete own staff uploads" on service_request_media
  for delete to authenticated
  using (origin = 'staff' and company_id = get_my_company_id());

-- Staff-uploaded objects live under staff/<company_id>/… so ownership is
-- checkable from the path without the media row existing yet (needed for
-- delete-after-failed-insert cleanup, and for signatures which have no row).
create policy "Staff manage own staff request media objects"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'service-request-media'
    and split_part(name, '/', 1) = 'staff'
    and split_part(name, '/', 2) = get_my_company_id()::text
  )
  with check (
    bucket_id = 'service-request-media'
    and split_part(name, '/', 1) = 'staff'
    and split_part(name, '/', 2) = get_my_company_id()::text
  );

-- ============================================================================
-- 3. Customer note / message on an existing request (anon write path)
-- ============================================================================
-- Proof of identity is the unguessable public_token — the same thing the
-- customer's /r/<token> link and now the scan page hand out. Only open
-- requests accept updates; a resolved or canceled one should get a fresh
-- request instead. Returns what the API route needs to notify staff; the
-- company's internal notification address is service-role only (0018 rule).
create or replace function add_customer_request_update(
  p_public_token text,
  p_body text,
  p_author_name text default null,
  p_contact_phone text default null,
  p_contact_email text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req service_requests;
  v_body text := btrim(coalesce(p_body, ''));
  v_name text := nullif(left(btrim(coalesce(p_author_name, '')), 120), '');
  v_phone text := nullif(left(btrim(coalesce(p_contact_phone, '')), 40), '');
  v_email text := nullif(left(btrim(coalesce(p_contact_email, '')), 254), '');
  v_is_service_role boolean := is_service_role();
  v_result json;
begin
  if length(v_body) < 2 or length(v_body) > 2000 then
    raise exception 'Update must be between 2 and 2000 characters' using errcode = '22023';
  end if;

  select * into v_req from service_requests where public_token = p_public_token;
  if v_req.id is null then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if v_req.status in ('resolved', 'canceled') then
    raise exception 'This request is closed' using errcode = 'P0001';
  end if;

  insert into request_activity (company_id, service_request_id, kind, visibility, body, metadata, author_kind)
  values (
    v_req.company_id, v_req.id, 'message', 'customer', v_body,
    jsonb_strip_nulls(jsonb_build_object(
      'author_name', v_name,
      'contact_phone', v_phone,
      'contact_email', v_email
    )),
    'customer'
  );

  update service_requests
  set last_customer_message_at = now(),
      unread_customer_messages = unread_customer_messages + 1,
      -- Fill in missing contact details; never overwrite what the original
      -- requester gave us.
      contact_phone = coalesce(contact_phone, v_phone),
      contact_email = coalesce(contact_email, v_email)
  where id = v_req.id;

  select json_build_object(
    'request_id', sr.id,
    'status', sr.status,
    'company_id', c.id,
    'company_name', c.name,
    'company_notification_email', case when v_is_service_role then c.notification_email else null end,
    'assigned_to', sr.assigned_to,
    'assigned_to_email', case when v_is_service_role then (
      select u.email from auth.users u where u.id = sr.assigned_to
    ) else null end,
    'equipment_name', e.name,
    'contact_name', sr.contact_name
  )
  into v_result
  from service_requests sr
  join companies c on c.id = sr.company_id
  join equipment e on e.id = sr.equipment_id
  where sr.id = v_req.id;

  return v_result;
end;
$$;

comment on function add_customer_request_update(text, text, text, text, text) is
  'Anon-callable. Appends a customer-visible message to an OPEN request identified by its public token and bumps the unread counter. Rate-limit at the API layer.';

revoke execute on function add_customer_request_update(text, text, text, text, text) from public;
grant execute on function add_customer_request_update(text, text, text, text, text) to anon, authenticated, service_role;

-- ============================================================================
-- 4. resolve_qr_code: open requests + next PM due on the scan page
-- ============================================================================
-- Same signature as 0013 → create or replace keeps the 0004/0012 grants.
-- New keys on `guide`: equipment.next_service_due_on, and `open_requests`
-- (newest first, max 5). Anyone holding the sticker can see these — that is
-- the product decision: a second employee at the café should see "already
-- reported, tech scheduled Tuesday" instead of filing a duplicate. Only the
-- requester's FIRST name is exposed; email/phone never are.
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
      'last_serviced_at', e.last_serviced_at,
      'next_service_due_on', e.next_service_due_on
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
    'open_requests', coalesce((
      select json_agg(json_build_object(
        'id', sr.id,
        'public_token', sr.public_token,
        'status', sr.status,
        'priority', sr.priority,
        'description', left(sr.description, 280),
        'contact_first_name', split_part(btrim(sr.contact_name), ' ', 1),
        'created_at', sr.created_at,
        'status_updated_at', sr.status_updated_at,
        'scheduled_for', sr.scheduled_for,
        'assigned_to_name', (select split_part(btrim(p.full_name), ' ', 1) from profiles p where p.id = sr.assigned_to),
        'update_count', (select count(*) from request_activity ra
                           where ra.service_request_id = sr.id and ra.visibility = 'customer')
      ) order by sr.created_at desc)
      from (
        select * from service_requests
        where equipment_id = e.id
          and status in ('new', 'in_progress', 'scheduled', 'on_hold')
        order by created_at desc
        limit 5
      ) sr
    ), '[]'::json),
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
-- 5. Checklist templates + inspections (scan-to-inspect)
-- ============================================================================
-- Items are a JSON array on the template (no child table): each item is
--   { "id": "<uuid>", "label": "...", "kind": "check"|"pass_fail"|"text"|"number"|"photo",
--     "required": bool, "help": "..."|null }
-- An inspection snapshots the template's items and adds `response` to each:
--   { ...item, "response": { "value": ..., "passed": bool|null, "note": "..."|null,
--                            "photo_paths": ["<company_id>/inspections/<inspection_id>/<uuid>.jpg"] } }
-- Photos and the signature live in the PRIVATE `equipment-files` bucket under
-- <company_id>/inspections/<inspection_id>/… — the 0013 storage policies
-- already scope that prefix to the company.
create table if not exists checklist_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  -- null = usable on any equipment type
  equipment_type_id uuid references equipment_types(id) on delete set null,
  name text not null,
  description text,
  items jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists checklist_templates_company_idx on checklist_templates (company_id, active);
create index if not exists checklist_templates_type_idx on checklist_templates (equipment_type_id);

alter table checklist_templates enable row level security;

create policy "Staff view own checklist templates" on checklist_templates
  for select using (company_id = get_my_company_id());
create policy "Staff insert own checklist templates" on checklist_templates
  for insert with check (company_id = get_my_company_id());
create policy "Staff update own checklist templates" on checklist_templates
  for update using (company_id = get_my_company_id()) with check (company_id = get_my_company_id());
create policy "Owners delete own checklist templates" on checklist_templates
  for delete using (company_id = get_my_company_id() and is_company_owner());

create trigger checklist_templates_set_updated_at
  before update on checklist_templates
  for each row execute function set_updated_at();

create table if not exists inspections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  equipment_id uuid not null references equipment(id) on delete cascade,
  checklist_template_id uuid references checklist_templates(id) on delete set null,
  service_request_id uuid references service_requests(id) on delete set null,
  maintenance_schedule_id uuid,
  performed_by uuid references profiles(id) on delete set null,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'abandoned')),
  template_name text not null,
  items jsonb not null default '[]'::jsonb,
  summary text,
  failed_count int not null default 0,
  signature_path text,
  signed_by_name text,
  signed_at timestamptz,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inspections_company_idx on inspections (company_id, started_at desc);
create index if not exists inspections_equipment_idx on inspections (equipment_id, started_at desc);
create index if not exists inspections_request_idx on inspections (service_request_id);

alter table inspections enable row level security;

create policy "Staff view own inspections" on inspections
  for select using (company_id = get_my_company_id());
create policy "Staff insert own inspections" on inspections
  for insert with check (company_id = get_my_company_id());
create policy "Staff update own inspections" on inspections
  for update using (company_id = get_my_company_id()) with check (company_id = get_my_company_id());
create policy "Owners delete own inspections" on inspections
  for delete using (company_id = get_my_company_id() and is_company_owner());

create trigger inspections_set_updated_at
  before update on inspections
  for each row execute function set_updated_at();

alter table service_requests
  add constraint service_requests_inspection_fk
  foreign key (inspection_id) references inspections(id) on delete set null;

-- ============================================================================
-- 6. Preventive-maintenance schedules
-- ============================================================================
-- Time-based only for now ("descale every 90 days"). Usage-based ("every
-- 5,000 shots") is a later column, not a different table.
create table if not exists maintenance_schedules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  equipment_id uuid not null references equipment(id) on delete cascade,
  name text not null,
  description text,
  interval_days int not null check (interval_days between 1 and 3650),
  -- How many days before next_due_on the PM request is created / customer told.
  lead_days int not null default 14 check (lead_days between 0 and 365),
  next_due_on date not null,
  last_completed_on date,
  auto_create_request boolean not null default true,
  notify_customer boolean not null default true,
  checklist_template_id uuid references checklist_templates(id) on delete set null,
  -- Which cycle has already been turned into a request (prevents duplicates).
  last_generated_for date,
  last_request_id uuid references service_requests(id) on delete set null,
  active boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists maintenance_schedules_company_idx on maintenance_schedules (company_id, active, next_due_on);
create index if not exists maintenance_schedules_equipment_idx on maintenance_schedules (equipment_id);

alter table maintenance_schedules enable row level security;

create policy "Staff view own maintenance schedules" on maintenance_schedules
  for select using (company_id = get_my_company_id());
create policy "Staff insert own maintenance schedules" on maintenance_schedules
  for insert with check (company_id = get_my_company_id());
create policy "Staff update own maintenance schedules" on maintenance_schedules
  for update using (company_id = get_my_company_id()) with check (company_id = get_my_company_id());
create policy "Staff delete own maintenance schedules" on maintenance_schedules
  for delete using (company_id = get_my_company_id());

create trigger maintenance_schedules_set_updated_at
  before update on maintenance_schedules
  for each row execute function set_updated_at();

alter table service_requests
  add constraint service_requests_maintenance_schedule_fk
  foreign key (maintenance_schedule_id) references maintenance_schedules(id) on delete set null;

alter table inspections
  add constraint inspections_maintenance_schedule_fk
  foreign key (maintenance_schedule_id) references maintenance_schedules(id) on delete set null;

-- equipment.next_service_due_on (0013 placeholder) = earliest active schedule.
create or replace function sync_equipment_next_service_due(p_equipment_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update equipment e
  set next_service_due_on = (
    select min(ms.next_due_on) from maintenance_schedules ms
    where ms.equipment_id = e.id and ms.active
  )
  where e.id = p_equipment_id;
$$;

revoke execute on function sync_equipment_next_service_due(uuid) from public, anon, authenticated;

create or replace function maintenance_schedules_sync_equipment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform sync_equipment_next_service_due(old.equipment_id);
    return old;
  end if;
  perform sync_equipment_next_service_due(new.equipment_id);
  if tg_op = 'UPDATE' and old.equipment_id is distinct from new.equipment_id then
    perform sync_equipment_next_service_due(old.equipment_id);
  end if;
  return new;
end;
$$;

revoke execute on function maintenance_schedules_sync_equipment() from public, anon, authenticated;

create trigger maintenance_schedules_sync_equipment
  after insert or update or delete on maintenance_schedules
  for each row execute function maintenance_schedules_sync_equipment();

-- Resolving a PM request completes the cycle and rolls the schedule forward.
-- Separate trigger so 0013's service_requests_on_resolved() stays untouched.
create or replace function service_requests_on_resolved_pm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_done date;
begin
  if new.status = 'resolved' and old.status is distinct from 'resolved'
     and new.maintenance_schedule_id is not null then
    select (coalesce(new.resolved_at, now()) at time zone coalesce(c.timezone, 'UTC'))::date
      into v_done
    from companies c where c.id = new.company_id;

    update maintenance_schedules ms
    set last_completed_on = v_done,
        next_due_on = v_done + ms.interval_days,
        updated_at = now()
    where ms.id = new.maintenance_schedule_id;
  end if;
  return new;
end;
$$;

revoke execute on function service_requests_on_resolved_pm() from public, anon, authenticated;

create trigger service_requests_on_resolved_pm
  after update on service_requests
  for each row execute function service_requests_on_resolved_pm();

-- Cron entry point (service_role only): turn every due schedule into a PM
-- request exactly once per cycle. Returns one json row per created request
-- with everything the cron route needs to email the customer and staff.
create or replace function generate_due_maintenance_requests()
returns setof json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ms record;
  v_req_id uuid;
  v_contact_name text;
  v_contact_email text;
  v_contact_phone text;
  v_description text;
  v_out json;
begin
  if not is_service_role() then
    raise exception 'generate_due_maintenance_requests() is service-role only' using errcode = '42501';
  end if;

  for v_ms in
    select ms.*, e.name as equipment_name, e.contact_name as e_contact_name,
           e.contact_phone as e_contact_phone, e.customer_id, e.status as equipment_status,
           cu.name as customer_name, cu.contact_name as cu_contact_name,
           cu.contact_email as cu_contact_email, cu.contact_phone as cu_contact_phone,
           c.name as company_name, c.notification_email, c.customer_updates_enabled,
           c.phone as company_phone, c.logo_path as company_logo_path,
           c.brand_color as company_brand_color, c.timezone as company_timezone
    from maintenance_schedules ms
    join equipment e on e.id = ms.equipment_id
    join companies c on c.id = ms.company_id
    left join customers cu on cu.id = e.customer_id
    where ms.active
      and ms.auto_create_request
      and e.status <> 'retired'
      and (ms.next_due_on - ms.lead_days) <= (now() at time zone coalesce(c.timezone, 'UTC'))::date
      and (ms.last_generated_for is null or ms.last_generated_for < ms.next_due_on)
    order by ms.next_due_on
    for update of ms skip locked
  loop
    v_contact_name := coalesce(v_ms.e_contact_name, v_ms.cu_contact_name, v_ms.customer_name, v_ms.company_name);
    v_contact_email := v_ms.cu_contact_email;
    v_contact_phone := coalesce(v_ms.e_contact_phone, v_ms.cu_contact_phone);
    v_description := format('Preventive maintenance due %s: %s', to_char(v_ms.next_due_on, 'Mon DD, YYYY'), v_ms.name)
      || case when v_ms.description is not null then E'\n\n' || v_ms.description else '' end;

    insert into service_requests (
      company_id, equipment_id, customer_id, description, contact_name, contact_email, contact_phone,
      status, priority, source, maintenance_schedule_id
    ) values (
      v_ms.company_id, v_ms.equipment_id, v_ms.customer_id, v_description, v_contact_name,
      v_contact_email, v_contact_phone, 'new', 'normal', 'pm', v_ms.id
    )
    returning id into v_req_id;

    insert into equipment_events (company_id, equipment_id, kind, summary, details, service_request_id, actor_kind)
    values (v_ms.company_id, v_ms.equipment_id, 'pm_due', 'Maintenance due: ' || v_ms.name,
            jsonb_build_object('schedule_id', v_ms.id, 'due_on', v_ms.next_due_on), v_req_id, 'system');

    insert into request_activity (company_id, service_request_id, kind, visibility, body, author_kind)
    values (v_ms.company_id, v_req_id, 'system', 'customer',
            'Scheduled maintenance request created', 'system');

    update maintenance_schedules
    set last_generated_for = v_ms.next_due_on, last_request_id = v_req_id, updated_at = now()
    where id = v_ms.id;

    select json_build_object(
      'request_id', sr.id,
      'public_token', sr.public_token,
      'company_id', v_ms.company_id,
      'company_name', v_ms.company_name,
      'company_notification_email', v_ms.notification_email,
      'company_phone', v_ms.company_phone,
      'company_logo_path', v_ms.company_logo_path,
      'company_brand_color', v_ms.company_brand_color,
      'customer_updates_enabled', v_ms.customer_updates_enabled,
      'notify_customer', v_ms.notify_customer,
      'equipment_id', v_ms.equipment_id,
      'equipment_name', v_ms.equipment_name,
      'schedule_id', v_ms.id,
      'schedule_name', v_ms.name,
      'due_on', v_ms.next_due_on,
      'contact_name', sr.contact_name,
      'contact_email', sr.contact_email
    ) into v_out
    from service_requests sr where sr.id = v_req_id;

    return next v_out;
  end loop;
  return;
end;
$$;

comment on function generate_due_maintenance_requests() is
  'Service-role only (cron). Creates one PM service request per due maintenance schedule per cycle and returns the rows to notify.';

revoke execute on function generate_due_maintenance_requests() from public, anon, authenticated;
grant execute on function generate_due_maintenance_requests() to service_role;

-- ============================================================================
-- 7. Scan-to-onboard: owners mint their own pre-printed code pool
-- ============================================================================
-- Mirrors the platform-admin generate_qr_code_batch() (0004/0013) but scoped
-- to the caller's own company. Plan gating (batchQr feature) is app-side.
create or replace function generate_company_qr_batch(p_count int)
returns setof qr_codes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := get_my_company_id();
begin
  if v_company is null or not is_company_owner() then
    raise exception 'Only company owners can generate a code batch' using errcode = '42501';
  end if;
  if p_count is null or p_count < 1 or p_count > 100 then
    raise exception 'Batch size must be between 1 and 100' using errcode = '22023';
  end if;

  return query
    insert into qr_codes (token, short_code, company_id, equipment_id, source, status)
    select encode(gen_random_bytes(12), 'hex'), generate_short_code(), v_company, null, 'batch', 'active'
    from generate_series(1, p_count)
    returning *;
end;
$$;

comment on function generate_company_qr_batch(int) is
  'Owner-only. Creates up to 100 unclaimed pre-printed codes for the caller''s company (scan-to-onboard).';

revoke execute on function generate_company_qr_batch(int) from public, anon;
grant execute on function generate_company_qr_batch(int) to authenticated;
