-- Reworks troubleshooting guides from a linear step list into a branching
-- decision tree: each guide_steps row is now a node, and guide_options rows
-- are its labeled branches (continue to another node, mark resolved, or
-- escalate straight to a service request).

-- ============================================================================
-- guide_steps: add root flag, make instructions optional (a pure
-- symptom-picker root node may not need body text)
-- ============================================================================

alter table guide_steps
  add column is_root boolean not null default false,
  alter column instructions drop not null;

-- ============================================================================
-- guide_options: the branches out of each node
-- ============================================================================

create table guide_options (
  id uuid primary key default gen_random_uuid(),
  guide_step_id uuid not null references guide_steps(id) on delete cascade,
  label text not null,
  sort_order int not null default 0,
  outcome text not null default 'continue' check (outcome in ('continue', 'resolved', 'escalate')),
  next_step_id uuid references guide_steps(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint guide_options_continue_needs_target
    check (outcome <> 'continue' or next_step_id is not null)
);

create index guide_options_guide_step_id_idx on guide_options (guide_step_id);
create index guide_options_next_step_id_idx on guide_options (next_step_id);

alter table guide_options enable row level security;

create policy "Staff manage own guide options" on guide_options
  for all using (
    exists (
      select 1 from guide_steps gs
      join equipment_types et on et.id = gs.equipment_type_id
      where gs.id = guide_options.guide_step_id
        and et.company_id = get_my_company_id()
    )
  )
  with check (
    exists (
      select 1 from guide_steps gs
      join equipment_types et on et.id = gs.equipment_type_id
      where gs.id = guide_options.guide_step_id
        and et.company_id = get_my_company_id()
    )
  );

-- ============================================================================
-- Backfill: turn each existing linear guide into an equivalent chain under
-- the new model, so nothing printed/bookmarked breaks. First step becomes
-- the root; every step gets "That fixed it" -> resolved, and "Still not
-- working" -> continue to the next step, or -> escalate on the last step.
-- ============================================================================

do $$
declare
  r record;
begin
  for r in
    select
      id,
      equipment_type_id,
      row_number() over (partition by equipment_type_id order by step_number) as rn,
      lead(id) over (partition by equipment_type_id order by step_number) as next_id
    from guide_steps
  loop
    if r.rn = 1 then
      update guide_steps set is_root = true where id = r.id;
    end if;

    insert into guide_options (guide_step_id, label, sort_order, outcome, next_step_id)
    values (r.id, 'That fixed it', 0, 'resolved', null);

    if r.next_id is not null then
      insert into guide_options (guide_step_id, label, sort_order, outcome, next_step_id)
      values (r.id, 'Still not working', 1, 'continue', r.next_id);
    else
      insert into guide_options (guide_step_id, label, sort_order, outcome, next_step_id)
      values (r.id, 'Still not working', 1, 'escalate', null);
    end if;
  end loop;
end $$;

-- One root per equipment type, enforced going forward.
create unique index guide_steps_one_root_per_type
  on guide_steps (equipment_type_id) where is_root;

alter table guide_steps drop constraint if exists guide_steps_equipment_type_id_step_number_key;
alter table guide_steps drop column step_number;

-- ============================================================================
-- service_requests: capture the path a customer took through the guide
-- ============================================================================

alter table service_requests
  add column troubleshooting_path jsonb not null default '[]'::jsonb;

-- ============================================================================
-- resolve_qr_code: return the full node graph (steps + their options) and
-- the root node id, instead of a flat ordered step list.
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
-- submit_service_request: accept and store the troubleshooting path
-- ============================================================================

create or replace function submit_service_request(
  p_qr_token text,
  p_description text,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_media jsonb default '[]'::jsonb,
  p_troubleshooting_path jsonb default '[]'::jsonb
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

  insert into service_requests (
    equipment_id, company_id, description, contact_name, contact_email, contact_phone, troubleshooting_path
  )
  values (
    v_equipment_id, v_company_id, p_description, p_contact_name,
    nullif(p_contact_email, ''), nullif(p_contact_phone, ''), p_troubleshooting_path
  )
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
