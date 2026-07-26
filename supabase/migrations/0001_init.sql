-- EquipQR initial schema: multi-tenant equipment/QR/troubleshooting/service-request app.
-- Run this in the Supabase SQL editor (or via `supabase db push`) on a fresh project.

create extension if not exists "pgcrypto";

-- ============================================================================
-- Tables
-- ============================================================================

create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  notification_email text not null,
  created_at timestamptz not null default now()
);

create type user_role as enum ('owner', 'technician');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  full_name text,
  role user_role not null default 'owner',
  created_at timestamptz not null default now()
);

create table equipment_types (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table guide_steps (
  id uuid primary key default gen_random_uuid(),
  equipment_type_id uuid not null references equipment_types(id) on delete cascade,
  step_number int not null,
  title text not null,
  instructions text not null,
  media_url text,
  created_at timestamptz not null default now(),
  unique (equipment_type_id, step_number)
);

create table equipment (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  equipment_type_id uuid not null references equipment_types(id) on delete restrict,
  name text not null,
  serial_number text,
  location text,
  qr_token text not null unique default encode(gen_random_bytes(12), 'hex'),
  created_at timestamptz not null default now()
);

create type request_status as enum ('new', 'in_progress', 'resolved');

create table service_requests (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references equipment(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  description text not null,
  contact_name text not null,
  contact_email text,
  contact_phone text,
  status request_status not null default 'new',
  created_at timestamptz not null default now()
);

create type media_kind as enum ('image', 'video');

create table service_request_media (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references service_requests(id) on delete cascade,
  storage_path text not null,
  media_type media_kind not null,
  created_at timestamptz not null default now()
);

create index equipment_company_id_idx on equipment (company_id);
create index guide_steps_equipment_type_id_idx on guide_steps (equipment_type_id);
create index service_requests_company_id_idx on service_requests (company_id);
create index service_requests_status_idx on service_requests (status);
create index service_request_media_request_id_idx on service_request_media (service_request_id);

-- ============================================================================
-- Helper functions
-- ============================================================================

-- security definer avoids RLS recursion when policies need "my own company id"
create or replace function get_my_company_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select company_id from profiles where id = auth.uid()
$$;

-- Atomically creates a company + the calling user's owner profile at signup.
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

  if exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'Profile already exists for this user';
  end if;

  v_slug := lower(regexp_replace(p_company_name, '[^a-zA-Z0-9]+', '-', 'g'))
    || '-' || substr(md5(random()::text), 1, 6);

  insert into companies (name, slug, notification_email)
  values (p_company_name, v_slug, p_notification_email)
  returning id into v_company_id;

  insert into profiles (id, company_id, full_name, role)
  values (auth.uid(), v_company_id, p_full_name, 'owner');

  return v_company_id;
end;
$$;

grant execute on function create_company_and_profile(text, text, text) to authenticated;

-- Public read path for the QR landing page: resolves everything needed to
-- render the troubleshooting guide from an unguessable qr_token in one call,
-- without granting anon any direct table access.
create or replace function get_equipment_guide(p_qr_token text)
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  result json;
begin
  select json_build_object(
    'equipment', json_build_object('id', e.id, 'name', e.name, 'qr_token', e.qr_token),
    'company', json_build_object('id', c.id, 'name', c.name),
    'equipment_type', json_build_object('id', et.id, 'name', et.name, 'description', et.description),
    'steps', coalesce((
      select json_agg(json_build_object(
        'id', gs.id,
        'step_number', gs.step_number,
        'title', gs.title,
        'instructions', gs.instructions,
        'media_url', gs.media_url
      ) order by gs.step_number)
      from guide_steps gs
      where gs.equipment_type_id = et.id
    ), '[]'::json)
  )
  into result
  from equipment e
  join companies c on c.id = e.company_id
  join equipment_types et on et.id = e.equipment_type_id
  where e.qr_token = p_qr_token;

  return result;
end;
$$;

grant execute on function get_equipment_guide(text) to anon, authenticated;

-- Public write path for the service request form: resolves the equipment/company
-- from the qr_token server-side (never trusts a client-supplied company_id) and
-- inserts the request + its media rows atomically.
-- Returns request id + the company/equipment details needed to send the
-- notification email. This is only ever called from our server-side API route
-- (never directly from the browser), so it's safe to include the company's
-- notification_email in the result.
create or replace function submit_service_request(
  p_qr_token text,
  p_description text,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_media jsonb default '[]'::jsonb
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equipment_id uuid;
  v_company_id uuid;
  v_request_id uuid;
  v_item jsonb;
  v_result json;
begin
  select e.id, e.company_id into v_equipment_id, v_company_id
  from equipment e
  where e.qr_token = p_qr_token;

  if v_equipment_id is null then
    raise exception 'Unknown equipment';
  end if;

  insert into service_requests (equipment_id, company_id, description, contact_name, contact_email, contact_phone)
  values (v_equipment_id, v_company_id, p_description, p_contact_name, nullif(p_contact_email, ''), nullif(p_contact_phone, ''))
  returning id into v_request_id;

  for v_item in select * from jsonb_array_elements(p_media)
  loop
    insert into service_request_media (service_request_id, storage_path, media_type)
    values (v_request_id, v_item->>'storage_path', (v_item->>'media_type')::media_kind);
  end loop;

  select json_build_object(
    'request_id', v_request_id,
    'company_name', c.name,
    'company_notification_email', c.notification_email,
    'equipment_name', e.name
  )
  into v_result
  from equipment e
  join companies c on c.id = e.company_id
  where e.id = v_equipment_id;

  return v_result;
end;
$$;

grant execute on function submit_service_request(text, text, text, text, text, jsonb) to anon, authenticated;

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table companies enable row level security;
alter table profiles enable row level security;
alter table equipment_types enable row level security;
alter table guide_steps enable row level security;
alter table equipment enable row level security;
alter table service_requests enable row level security;
alter table service_request_media enable row level security;

-- companies: staff can see/update only their own company. No direct insert/delete
-- policy — company creation only happens via create_company_and_profile().
create policy "Staff can view own company" on companies
  for select using (id = get_my_company_id());

create policy "Owners can update own company" on companies
  for update using (id = get_my_company_id()) with check (id = get_my_company_id());

-- profiles
create policy "Staff can view own profile or teammates" on profiles
  for select using (id = auth.uid() or company_id = get_my_company_id());

create policy "Users can insert their own profile" on profiles
  for insert with check (id = auth.uid());

create policy "Users can update their own profile" on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- equipment_types
create policy "Staff manage own equipment types" on equipment_types
  for all using (company_id = get_my_company_id()) with check (company_id = get_my_company_id());

-- guide_steps (scoped through the parent equipment_type's company)
create policy "Staff manage own guide steps" on guide_steps
  for all using (
    exists (
      select 1 from equipment_types et
      where et.id = guide_steps.equipment_type_id
      and et.company_id = get_my_company_id()
    )
  )
  with check (
    exists (
      select 1 from equipment_types et
      where et.id = guide_steps.equipment_type_id
      and et.company_id = get_my_company_id()
    )
  );

-- equipment
create policy "Staff manage own equipment" on equipment
  for all using (company_id = get_my_company_id()) with check (company_id = get_my_company_id());

-- service_requests: staff can view/update (status changes); no direct insert/delete
-- policy — anonymous submissions only happen via submit_service_request().
create policy "Staff can view own service requests" on service_requests
  for select using (company_id = get_my_company_id());

create policy "Staff can update own service requests" on service_requests
  for update using (company_id = get_my_company_id()) with check (company_id = get_my_company_id());

-- service_request_media (scoped through the parent request's company)
create policy "Staff can view own service request media" on service_request_media
  for select using (
    exists (
      select 1 from service_requests sr
      where sr.id = service_request_media.service_request_id
      and sr.company_id = get_my_company_id()
    )
  );

-- ============================================================================
-- Storage bucket for customer-submitted photos/videos
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('service-request-media', 'service-request-media', false)
on conflict (id) do nothing;

-- Anonymous customers can upload (submitting evidence of a problem); nobody can
-- read without being an authenticated staff member of the owning company.
-- This is intentionally permissive on write for MVP simplicity — consider adding
-- file-size/type limits and rate limiting before a public launch.
create policy "Anyone can upload service request media"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'service-request-media');

create policy "Company staff can view their own service request media"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'service-request-media'
    and exists (
      select 1 from service_request_media srm
      join service_requests sr on sr.id = srm.service_request_id
      where srm.storage_path = storage.objects.name
      and sr.company_id = get_my_company_id()
    )
  );
