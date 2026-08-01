-- Decouples QR codes from equipment into their own pool, so a company can
-- either generate a code instantly (today's behavior) or claim one of a
-- batch of pre-printed codes shipped to them by the print service.
--
-- equipment.qr_token is intentionally left in place (unused by new code)
-- rather than dropped, to keep this migration low-risk and reversible.

create extension if not exists "pgcrypto";

-- ============================================================================
-- Platform admins (operate the print service / can manage any company's
-- QR code batches). Not tied to any single company.
-- ============================================================================

create table platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

grant execute on function is_platform_admin() to authenticated;

alter table platform_admins enable row level security;

create policy "Admins can view the admin list" on platform_admins
  for select using (is_platform_admin());

-- ============================================================================
-- QR code pool
-- ============================================================================

create type qr_code_source as enum ('instant', 'batch');

create table qr_codes (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  company_id uuid not null references companies(id) on delete cascade,
  equipment_id uuid references equipment(id) on delete set null,
  source qr_code_source not null default 'instant',
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint qr_codes_equipment_unique unique (equipment_id)
);

create index qr_codes_company_id_idx on qr_codes (company_id);
create index qr_codes_equipment_id_idx on qr_codes (equipment_id);

-- Backfill: every existing piece of equipment already has a working QR token
-- printed or downloaded somewhere, so give each one a matching qr_codes row
-- with the exact same token — no already-printed sticker or downloaded QR
-- image breaks.
insert into qr_codes (token, company_id, equipment_id, source, claimed_at, created_at)
select qr_token, company_id, id, 'instant', created_at, created_at
from equipment;

alter table qr_codes enable row level security;

create policy "Staff view own company qr codes" on qr_codes
  for select using (company_id = get_my_company_id());

create policy "Staff insert instant qr codes for own company" on qr_codes
  for insert with check (company_id = get_my_company_id() and source = 'instant');

create policy "Platform admins manage all qr codes" on qr_codes
  for all using (is_platform_admin()) with check (is_platform_admin());

create policy "Platform admins view all companies" on companies
  for select using (is_platform_admin());

-- ============================================================================
-- Public resolution: looks up a scanned/visited token and returns enough to
-- render either the troubleshooting guide (claimed), an "assign this code"
-- prompt (unclaimed + viewer is staff of the owning company — checked in the
-- app, not here), or a generic not-set-up message (unclaimed + anyone else).
-- ============================================================================

create or replace function resolve_qr_code(p_token text)
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_code record;
  v_guide json;
begin
  select * into v_code from qr_codes where token = p_token;

  if v_code is null then
    return json_build_object('status', 'not_found');
  end if;

  if v_code.equipment_id is null then
    return json_build_object(
      'status', 'unclaimed',
      'company_id', v_code.company_id
    );
  end if;

  select json_build_object(
    'equipment', json_build_object('id', e.id, 'name', e.name),
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
  into v_guide
  from equipment e
  join companies c on c.id = e.company_id
  join equipment_types et on et.id = e.equipment_type_id
  where e.id = v_code.equipment_id;

  return json_build_object('status', 'claimed', 'guide', v_guide);
end;
$$;

grant execute on function resolve_qr_code(text) to anon, authenticated;

-- Links an unclaimed code (that belongs to the caller's company) to one of
-- the caller's equipment. security definer so it can bypass the narrow
-- staff RLS policies above while still enforcing company ownership itself.
create or replace function claim_qr_code(p_token text, p_equipment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
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

  update qr_codes
  set equipment_id = p_equipment_id, claimed_at = now()
  where token = p_token
    and company_id = v_company_id
    and equipment_id is null;

  if not found then
    raise exception 'This code is not available to claim';
  end if;
end;
$$;

grant execute on function claim_qr_code(text, uuid) to authenticated;

-- Admin-only: generates a batch of short, hand-typable codes for a company
-- (e.g. AB3D-9F2K), for the print service to produce physical stickers from.
create or replace function generate_qr_code_batch(p_company_id uuid, p_count int)
returns setof qr_codes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_token text;
  i int;
  j int;
begin
  if not is_platform_admin() then
    raise exception 'Not authorized';
  end if;

  if p_count < 1 or p_count > 500 then
    raise exception 'Count must be between 1 and 500';
  end if;

  for i in 1..p_count loop
    loop
      v_token := '';
      for j in 1..8 loop
        v_token := v_token || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
        if j = 4 then
          v_token := v_token || '-';
        end if;
      end loop;

      exit when not exists (select 1 from qr_codes where token = v_token);
    end loop;

    insert into qr_codes (token, company_id, source)
    values (v_token, p_company_id, 'batch');
  end loop;

  return query select * from qr_codes where company_id = p_company_id and source = 'batch'
    order by created_at desc limit p_count;
end;
$$;

grant execute on function generate_qr_code_batch(uuid, int) to authenticated;

-- ============================================================================
-- Update the service-request submission path to resolve via the qr_codes
-- pool instead of equipment.qr_token directly.
-- ============================================================================

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
  select qc.equipment_id, qc.company_id into v_equipment_id, v_company_id
  from qr_codes qc
  where qc.token = p_qr_token;

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
