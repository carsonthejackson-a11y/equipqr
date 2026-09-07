-- 0022_webhooks_and_custom_fields.sql
--
-- Two Next-lane features ported onto this branch after its foundation
-- (0019–0021) shipped, plus a hardening pass on the event tables they hang
-- off. Additive: no drops except two insert policies recreated stricter, no
-- signature changes to anything that exists.
--
--   1. Custom fields      — equipment_custom_fields: owner-defined field
--                           definitions whose values live in
--                           equipment.custom_fields (jsonb since 0013).
--                           resolve_qr_code() gains equipment.custom_fields
--                           for the ones flagged show_on_scan_page.
--   2. Outbound webhooks  — webhook_endpoints (owner-managed, https only,
--                           10 active per company, HMAC secret readable by
--                           the service role only) and webhook_deliveries:
--                           an outbox filled by security-definer triggers on
--                           equipment_events / request_activity and drained
--                           by src/lib/webhooks.ts through service-role RPCs
--                           (claim / finish / release / prune / retry).
--   3. Hardening          — the 0013 insert policies on equipment_events and
--                           request_activity only checked company_id, never
--                           that the referenced unit / request belonged to
--                           that company. Combined with a security-definer
--                           trigger that reads the parent, that was a
--                           cross-tenant read; both layers are fixed here.
--
-- Local harness: scripts/local-db/smoke-port.sql exercises every object in
-- this file as anon / technician / owner / service role.

-- ============================================================================
-- 1. Custom fields: company-defined field definitions
-- ============================================================================
--
-- Values are stored on equipment.custom_fields as { "<key>": value }. Keys are
-- stable slugs chosen at creation (renaming the label never rewrites rows);
-- deleting a definition leaves stale keys in the jsonb, which the app ignores.

create table equipment_custom_fields (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  -- Slug: lowercase letters, digits and underscores, e.g. "filter_size".
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label text not null check (length(label) between 1 and 60),
  field_type text not null default 'text'
    check (field_type in ('text', 'number', 'date', 'select', 'boolean')),
  -- For field_type = 'select': a JSON array of option strings.
  options jsonb not null default '[]'::jsonb,
  -- Free-form help text under the input.
  help_text text,
  -- Shown to customers on the scan page? Off by default — most fields are
  -- internal (asset tag, filter size). The public RPC honours this in a
  -- later migration; for now it is a stored preference.
  show_on_scan_page boolean not null default false,
  sort_order int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, key)
);

create index equipment_custom_fields_company_sort_idx on equipment_custom_fields (company_id, sort_order, created_at);
create index equipment_custom_fields_created_by_idx on equipment_custom_fields (created_by);

drop trigger if exists equipment_custom_fields_set_updated_at on equipment_custom_fields;
create trigger equipment_custom_fields_set_updated_at
  before update on equipment_custom_fields
  for each row execute function set_updated_at();

alter table equipment_custom_fields enable row level security;

-- Every staff member needs the definitions to render a form; only owners
-- shape them.
create policy "Staff view own custom fields" on equipment_custom_fields
  for select using (company_id = get_my_company_id());

create policy "Owners insert own custom fields" on equipment_custom_fields
  for insert with check (company_id = get_my_company_id() and is_company_owner());

create policy "Owners update own custom fields" on equipment_custom_fields
  for update using (company_id = get_my_company_id() and is_company_owner())
  with check (company_id = get_my_company_id() and is_company_owner());

create policy "Owners delete own custom fields" on equipment_custom_fields
  for delete using (company_id = get_my_company_id() and is_company_owner());

-- ============================================================================

-- ============================================================================
-- 2. Outbound webhooks
-- ============================================================================

create table webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  url text not null check (url ~* '^https://' and length(url) <= 2000),
  description text,
  -- Shared secret for the X-EquipQR-Signature HMAC. Shown once at creation
  -- (like an API key) but stored in clear because signing needs it; the
  -- settings page never selects it.
  secret text not null,
  -- Event types this endpoint wants. Empty = every event.
  events text[] not null default '{}',
  is_active boolean not null default true,
  -- Consecutive failed deliveries. Reset to 0 on any success; the deliverer
  -- disables the endpoint past a threshold and stamps disabled_at.
  failure_count int not null default 0,
  disabled_at timestamptz,
  last_delivery_at timestamptz,
  last_delivery_status int,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index webhook_endpoints_company_id_idx on webhook_endpoints (company_id);
create index webhook_endpoints_created_by_idx on webhook_endpoints (created_by);

drop trigger if exists webhook_endpoints_set_updated_at on webhook_endpoints;
create trigger webhook_endpoints_set_updated_at
  before update on webhook_endpoints
  for each row execute function set_updated_at();

alter table webhook_endpoints enable row level security;

create policy "Owners view own webhook endpoints" on webhook_endpoints
  for select using (company_id = get_my_company_id() and is_company_owner());

create policy "Owners insert own webhook endpoints" on webhook_endpoints
  for insert with check (company_id = get_my_company_id() and is_company_owner());

create policy "Owners update own webhook endpoints" on webhook_endpoints
  for update using (company_id = get_my_company_id() and is_company_owner())
  with check (company_id = get_my_company_id() and is_company_owner());

create policy "Owners delete own webhook endpoints" on webhook_endpoints
  for delete using (company_id = get_my_company_id() and is_company_owner());

-- The outbox. One row per (event, endpoint). Filled by the triggers below
-- (and by the app for "send a test event"); drained by src/lib/webhooks.ts
-- through the service role.
create table webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  endpoint_id uuid not null references webhook_endpoints(id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'failed')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  response_status int,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create index webhook_deliveries_pending_idx on webhook_deliveries (next_attempt_at)
  where status = 'pending';
create index webhook_deliveries_endpoint_created_idx on webhook_deliveries (endpoint_id, created_at desc);
create index webhook_deliveries_company_id_idx on webhook_deliveries (company_id);

alter table webhook_deliveries enable row level security;

-- Owners can read the delivery log for their endpoints. Nobody writes
-- through RLS: rows are created by security-definer triggers / RPCs and
-- updated by the service role.
create policy "Owners view own webhook deliveries" on webhook_deliveries
  for select using (company_id = get_my_company_id() and is_company_owner());

-- Fans one event out to every active endpoint of the company that wants it.
-- Security definer: the calling role (authenticated staff, or anon through a
-- public RPC) has no insert policy on webhook_deliveries, and must not.
create or replace function enqueue_webhook_event(
  p_company_id uuid,
  p_event_type text,
  p_data jsonb
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid := gen_random_uuid();
  v_occurred timestamptz := now();
  v_count int;
begin
  insert into webhook_deliveries (company_id, endpoint_id, event_type, payload)
  select
    we.company_id,
    we.id,
    p_event_type,
    jsonb_build_object(
      'id', v_event_id,
      'type', p_event_type,
      'created_at', v_occurred,
      'company_id', p_company_id,
      'data', p_data
    )
  from webhook_endpoints we
  where we.company_id = p_company_id
    and we.is_active
    and (cardinality(we.events) = 0 or p_event_type = any (we.events));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function enqueue_webhook_event(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function enqueue_webhook_event(uuid, text, jsonb) to service_role;

-- Public webhook event catalogue (keep docs/API.md "Webhooks" in sync):
--
--   equipment.created            equipment_events.kind = equipment_created
--   equipment.updated                                    equipment_updated
--   equipment.status_changed                             status_changed
--   equipment.note_added                                 note
--   equipment.code_changed                               code_assigned / code_replaced / code_retired / code_reassigned
--   visit.scheduled                                      visit_scheduled
--   visit.completed                                      visit_completed
--   maintenance.due                                      pm_due
--   service_request.created                              request_submitted
--   service_request.resolved                             request_resolved
--   service_request.status_changed    request_activity.kind = status_change
--   service_request.assigned                                   assignment
--   service_request.priority_changed                           priority_change
--   service_request.customer_message                           message (author_kind = customer)
--   service_request.note              note with visibility = customer only
--   webhook.test                      sent from Settings → API → "Send test"
--
-- Internal notes, email audit rows and system rows never leave the tenant.

create or replace function webhook_event_type_for_equipment_event(p_kind text)
returns text
language sql
immutable
as $$
  select case p_kind
    when 'equipment_created' then 'equipment.created'
    when 'equipment_updated' then 'equipment.updated'
    when 'status_changed' then 'equipment.status_changed'
    when 'note' then 'equipment.note_added'
    when 'code_assigned' then 'equipment.code_changed'
    when 'code_replaced' then 'equipment.code_changed'
    when 'code_retired' then 'equipment.code_changed'
    when 'code_reassigned' then 'equipment.code_changed'
    when 'visit_scheduled' then 'visit.scheduled'
    when 'visit_completed' then 'visit.completed'
    when 'pm_due' then 'maintenance.due'
    when 'request_submitted' then 'service_request.created'
    when 'request_resolved' then 'service_request.resolved'
    else null
  end;
$$;

revoke execute on function webhook_event_type_for_equipment_event(text) from public, anon, authenticated;

create or replace function equipment_events_enqueue_webhook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text := webhook_event_type_for_equipment_event(new.kind);
  v_equipment jsonb;
  v_request jsonb;
begin
  if v_type is null then
    return new;
  end if;

  -- Cheap early exit: most companies have no endpoints at all.
  if not exists (select 1 from webhook_endpoints where company_id = new.company_id and is_active) then
    return new;
  end if;

  select jsonb_build_object(
    'id', e.id, 'name', e.name, 'status', e.status, 'make', e.make, 'model', e.model,
    'serial_number', e.serial_number, 'location', e.location, 'customer_id', e.customer_id,
    'equipment_type_id', e.equipment_type_id, 'last_serviced_at', e.last_serviced_at,
    'next_service_due_on', e.next_service_due_on
  ) into v_equipment
  from equipment e where e.id = new.equipment_id;

  if new.service_request_id is not null then
    select jsonb_build_object(
      'id', sr.id, 'status', sr.status, 'priority', sr.priority, 'assigned_to', sr.assigned_to,
      'scheduled_for', sr.scheduled_for, 'contact_name', sr.contact_name, 'created_at', sr.created_at
    ) into v_request
    from service_requests sr where sr.id = new.service_request_id;
  end if;

  perform enqueue_webhook_event(
    new.company_id,
    v_type,
    jsonb_build_object(
      'equipment', v_equipment,
      'service_request', v_request,
      'event', jsonb_build_object(
        'id', new.id, 'kind', new.kind, 'summary', new.summary, 'details', new.details,
        'actor_kind', new.actor_kind, 'occurred_at', new.occurred_at
      )
    )
  );

  return new;
end;
$$;

revoke execute on function equipment_events_enqueue_webhook() from public, anon, authenticated;

drop trigger if exists equipment_events_enqueue_webhook on equipment_events;
create trigger equipment_events_enqueue_webhook
  after insert on equipment_events
  for each row execute function equipment_events_enqueue_webhook();

create or replace function request_activity_enqueue_webhook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
  v_request jsonb;
begin
  v_type := case
    when new.kind = 'status_change' then 'service_request.status_changed'
    when new.kind = 'assignment' then 'service_request.assigned'
    when new.kind = 'priority_change' then 'service_request.priority_changed'
    when new.kind = 'message' and new.author_kind = 'customer' then 'service_request.customer_message'
    when new.kind = 'note' and new.visibility = 'customer' then 'service_request.note'
    else null
  end;

  if v_type is null then
    return new;
  end if;

  if not exists (select 1 from webhook_endpoints where company_id = new.company_id and is_active) then
    return new;
  end if;

  select jsonb_build_object(
    'id', sr.id, 'status', sr.status, 'priority', sr.priority, 'assigned_to', sr.assigned_to,
    'scheduled_for', sr.scheduled_for, 'contact_name', sr.contact_name, 'created_at', sr.created_at,
    'equipment', jsonb_build_object('id', e.id, 'name', e.name, 'status', e.status, 'customer_id', e.customer_id)
  ) into v_request
  from service_requests sr
  join equipment e on e.id = sr.equipment_id
  where sr.id = new.service_request_id;

  perform enqueue_webhook_event(
    new.company_id,
    v_type,
    jsonb_build_object(
      'service_request', v_request,
      'activity', jsonb_build_object(
        'id', new.id, 'kind', new.kind, 'body', new.body, 'metadata', new.metadata,
        'author_kind', new.author_kind, 'created_at', new.created_at
      )
    )
  );

  return new;
end;
$$;

revoke execute on function request_activity_enqueue_webhook() from public, anon, authenticated;

drop trigger if exists request_activity_enqueue_webhook on request_activity;
create trigger request_activity_enqueue_webhook
  after insert on request_activity
  for each row execute function request_activity_enqueue_webhook();

-- Atomically leases a batch of due deliveries for one worker run. Bumps
-- attempts and pushes next_attempt_at out so a second worker (or a crashed
-- one) doesn't double-send; the worker then records the outcome with
-- finish_webhook_delivery(). Service role only.
create or replace function claim_webhook_deliveries(p_limit int default 50, p_company_id uuid default null)
returns setof webhook_deliveries
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select id
    from webhook_deliveries
    where status = 'pending'
      and next_attempt_at <= now()
      and (p_company_id is null or company_id = p_company_id)
    order by next_attempt_at
    limit greatest(1, least(p_limit, 200))
    for update skip locked
  )
  update webhook_deliveries d
  set attempts = d.attempts + 1,
      last_attempt_at = now(),
      -- Lease: if the worker dies mid-flight the row comes back in 5 minutes.
      next_attempt_at = now() + interval '5 minutes'
  from due
  where d.id = due.id
  returning d.*;
end;
$$;

revoke execute on function claim_webhook_deliveries(int, uuid) from public, anon, authenticated;
grant execute on function claim_webhook_deliveries(int, uuid) to service_role;

-- Records the result of one attempt and keeps the endpoint's health columns
-- in step. Retry schedule and the auto-disable threshold live here so every
-- worker (cron, after() flush, test send) behaves identically.
create or replace function finish_webhook_delivery(
  p_delivery_id uuid,
  p_response_status int,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery webhook_deliveries;
  v_ok boolean := p_response_status is not null and p_response_status between 200 and 299;
  v_max_attempts constant int := 5;
  v_disable_after constant int := 20;
  v_delay interval;
begin
  select * into v_delivery from webhook_deliveries where id = p_delivery_id;
  if v_delivery.id is null then
    return;
  end if;

  if v_ok then
    update webhook_deliveries
    set status = 'delivered', response_status = p_response_status, last_error = null, delivered_at = now()
    where id = p_delivery_id;

    update webhook_endpoints
    set failure_count = 0, last_delivery_at = now(), last_delivery_status = p_response_status
    where id = v_delivery.endpoint_id;
    return;
  end if;

  v_delay := case v_delivery.attempts
    when 1 then interval '1 minute'
    when 2 then interval '5 minutes'
    when 3 then interval '30 minutes'
    else interval '2 hours'
  end;

  update webhook_deliveries
  set status = case when v_delivery.attempts >= v_max_attempts then 'failed' else 'pending' end,
      response_status = p_response_status,
      last_error = left(p_error, 500),
      next_attempt_at = now() + v_delay
  where id = p_delivery_id;

  update webhook_endpoints
  set failure_count = failure_count + 1,
      last_delivery_at = now(),
      last_delivery_status = p_response_status,
      is_active = case when failure_count + 1 >= v_disable_after then false else is_active end,
      disabled_at = case when failure_count + 1 >= v_disable_after then coalesce(disabled_at, now()) else disabled_at end
  where id = v_delivery.endpoint_id;
end;
$$;

revoke execute on function finish_webhook_delivery(uuid, int, text) from public, anon, authenticated;
grant execute on function finish_webhook_delivery(uuid, int, text) to service_role;

-- Owners can queue a synthetic event at one of their own endpoints from the
-- settings page. Runs as the caller for the ownership check, then through
-- the security-definer enqueue.
create or replace function enqueue_webhook_test(p_endpoint_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_endpoint webhook_endpoints;
  v_id uuid;
begin
  select * into v_endpoint
  from webhook_endpoints
  where id = p_endpoint_id
    and company_id = get_my_company_id();

  if v_endpoint.id is null or not is_company_owner() then
    raise exception 'Webhook endpoint not found';
  end if;

  insert into webhook_deliveries (company_id, endpoint_id, event_type, payload)
  values (
    v_endpoint.company_id,
    v_endpoint.id,
    'webhook.test',
    jsonb_build_object(
      'id', gen_random_uuid(),
      'type', 'webhook.test',
      'created_at', now(),
      'company_id', v_endpoint.company_id,
      'data', jsonb_build_object('message', 'Hello from EquipQR — your webhook endpoint is wired up.')
    )
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function enqueue_webhook_test(uuid) from public, anon;
grant execute on function enqueue_webhook_test(uuid) to authenticated;

-- Opportunistic retention: delivered/failed rows older than 30 days are
-- noise. Called by the drain job; service role only.
create or replace function prune_webhook_deliveries()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  delete from webhook_deliveries
  where status in ('delivered', 'failed')
    and created_at < now() - interval '30 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function prune_webhook_deliveries() from public, anon, authenticated;
grant execute on function prune_webhook_deliveries() to service_role;

-- ============================================================================
-- 2b. Fan-out triggers, final form: never read across the tenant boundary
-- ============================================================================

create or replace function equipment_events_enqueue_webhook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text := webhook_event_type_for_equipment_event(new.kind);
  v_equipment jsonb;
  v_request jsonb;
begin
  if v_type is null then
    return new;
  end if;

  if not exists (select 1 from webhook_endpoints where company_id = new.company_id and is_active) then
    return new;
  end if;

  -- Company predicate on every lookup: a row that points at another tenant's
  -- unit (which the insert policy now refuses anyway) must never be
  -- serialised into this tenant's outbox.
  select jsonb_build_object(
    'id', e.id, 'name', e.name, 'status', e.status, 'make', e.make, 'model', e.model,
    'serial_number', e.serial_number, 'location', e.location, 'customer_id', e.customer_id,
    'equipment_type_id', e.equipment_type_id, 'last_serviced_at', e.last_serviced_at,
    'next_service_due_on', e.next_service_due_on
  ) into v_equipment
  from equipment e
  where e.id = new.equipment_id and e.company_id = new.company_id;

  if v_equipment is null then
    return new;
  end if;

  if new.service_request_id is not null then
    select jsonb_build_object(
      'id', sr.id, 'status', sr.status, 'priority', sr.priority, 'assigned_to', sr.assigned_to,
      'scheduled_for', sr.scheduled_for, 'contact_name', sr.contact_name, 'created_at', sr.created_at
    ) into v_request
    from service_requests sr
    where sr.id = new.service_request_id and sr.company_id = new.company_id;
  end if;

  perform enqueue_webhook_event(
    new.company_id,
    v_type,
    jsonb_build_object(
      'equipment', v_equipment,
      'service_request', v_request,
      'event', jsonb_build_object(
        'id', new.id, 'kind', new.kind, 'summary', new.summary, 'details', new.details,
        'actor_kind', new.actor_kind, 'occurred_at', new.occurred_at
      )
    )
  );

  return new;
end;
$$;

create or replace function request_activity_enqueue_webhook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
  v_request jsonb;
begin
  v_type := case
    when new.kind = 'status_change' then 'service_request.status_changed'
    when new.kind = 'assignment' then 'service_request.assigned'
    when new.kind = 'priority_change' then 'service_request.priority_changed'
    when new.kind = 'message' and new.author_kind = 'customer' then 'service_request.customer_message'
    when new.kind = 'note' and new.visibility = 'customer' then 'service_request.note'
    else null
  end;

  if v_type is null then
    return new;
  end if;

  if not exists (select 1 from webhook_endpoints where company_id = new.company_id and is_active) then
    return new;
  end if;

  select jsonb_build_object(
    'id', sr.id, 'status', sr.status, 'priority', sr.priority, 'assigned_to', sr.assigned_to,
    'scheduled_for', sr.scheduled_for, 'contact_name', sr.contact_name, 'created_at', sr.created_at,
    'equipment', jsonb_build_object('id', e.id, 'name', e.name, 'status', e.status, 'customer_id', e.customer_id)
  ) into v_request
  from service_requests sr
  join equipment e on e.id = sr.equipment_id
  where sr.id = new.service_request_id and sr.company_id = new.company_id;

  if v_request is null then
    return new;
  end if;

  perform enqueue_webhook_event(
    new.company_id,
    v_type,
    jsonb_build_object(
      'service_request', v_request,
      'activity', jsonb_build_object(
        'id', new.id, 'kind', new.kind, 'body', new.body, 'metadata', new.metadata,
        'author_kind', new.author_kind, 'created_at', new.created_at
      )
    )
  );

  return new;
end;
$$;

-- ============================================================================
-- 2c. Active-endpoint cap enforced in the database
-- ============================================================================

create or replace function webhook_endpoints_enforce_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max constant int := 10;
  v_active int;
begin
  if not new.is_active then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.is_active then
    return new;
  end if;

  select count(*) into v_active
  from webhook_endpoints
  where company_id = new.company_id
    and is_active
    and id <> new.id;

  if v_active >= v_max then
    raise exception 'A company can have at most % active webhook endpoints', v_max;
  end if;
  return new;
end;
$$;

revoke execute on function webhook_endpoints_enforce_cap() from public, anon, authenticated;

drop trigger if exists webhook_endpoints_enforce_cap on webhook_endpoints;
create trigger webhook_endpoints_enforce_cap
  before insert or update of is_active on webhook_endpoints
  for each row execute function webhook_endpoints_enforce_cap();

-- ============================================================================

-- ============================================================================
-- 2d. Fair leasing + hand-back

-- Same signature as 0019; at most 25 rows per endpoint per claim so one
-- stalled receiver can't monopolise a batch.
create or replace function claim_webhook_deliveries(p_limit int default 50, p_company_id uuid default null)
returns setof webhook_deliveries
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with ranked as (
    select id,
           row_number() over (partition by endpoint_id order by next_attempt_at) as per_endpoint
    from webhook_deliveries
    where status = 'pending'
      and next_attempt_at <= now()
      and (p_company_id is null or company_id = p_company_id)
    order by next_attempt_at
    limit greatest(1, least(p_limit, 200)) * 4
  ),
  due as (
    select d.id
    from webhook_deliveries d
    join ranked r on r.id = d.id
    where r.per_endpoint <= 25
    order by d.next_attempt_at
    limit greatest(1, least(p_limit, 200))
    for update of d skip locked
  )
  update webhook_deliveries d
  set attempts = d.attempts + 1,
      last_attempt_at = now(),
      next_attempt_at = now() + interval '5 minutes'
  from due
  where d.id = due.id
  returning d.*;
end;
$$;

revoke execute on function claim_webhook_deliveries(int, uuid) from public, anon, authenticated;
grant execute on function claim_webhook_deliveries(int, uuid) to service_role;

-- A worker that leased rows but ran out of time before attempting them
-- gives them back: the attempt it never made is refunded and the row is
-- due again immediately. Only pending (leased, unfinished) rows are touched.
create or replace function release_webhook_deliveries(p_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update webhook_deliveries
  set attempts = greatest(attempts - 1, 0),
      next_attempt_at = now()
  where id = any (p_ids)
    and status = 'pending';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function release_webhook_deliveries(uuid[]) from public, anon, authenticated;
grant execute on function release_webhook_deliveries(uuid[]) to service_role;

-- ============================================================================

-- ============================================================================
-- 2e. The signing secret never leaves the server
-- Owners keep insert/update rights on the column (create + rotate write it);
-- reading it is service-role only. A table-level SELECT grant covers every
-- column, so the table grant is revoked and the public columns are granted
-- back one by one. Every app-side select on this table already lists
-- columns explicitly (`select *` by staff now fails, by design).

revoke select on webhook_endpoints from anon, authenticated;
grant select (
  id, company_id, url, description, events, is_active, failure_count, disabled_at,
  last_delivery_at, last_delivery_status, created_by, created_at, updated_at
) on webhook_endpoints to authenticated;

-- ============================================================================

-- ============================================================================
-- 2f. Lease one specific delivery ("Send test" must not wait on the backlog)

create or replace function claim_webhook_delivery(p_delivery_id uuid)
returns setof webhook_deliveries
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update webhook_deliveries d
  set attempts = d.attempts + 1,
      last_attempt_at = now(),
      next_attempt_at = now() + interval '5 minutes'
  where d.id = p_delivery_id
    and d.status = 'pending'
    and d.next_attempt_at <= now()
  returning d.*;
end;
$$;

revoke execute on function claim_webhook_delivery(uuid) from public, anon, authenticated;
grant execute on function claim_webhook_delivery(uuid) to service_role;

-- ============================================================================
-- 2g. Owners re-queue a failed delivery from the settings page
-- ============================================================================
-- Staff have no update policy on webhook_deliveries (the outbox is written
-- by triggers and the service role), so "Retry" is a narrow security-definer
-- RPC that does the ownership check itself. Only `failed` rows; the endpoint
-- must be active.

create or replace function retry_webhook_delivery(p_delivery_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery webhook_deliveries;
begin
  select * into v_delivery
  from webhook_deliveries
  where id = p_delivery_id
    and company_id = get_my_company_id();

  if v_delivery.id is null or not is_company_owner() then
    raise exception 'Webhook delivery not found';
  end if;

  if v_delivery.status <> 'failed' then
    -- Pending rows are already queued; delivered rows are done. Nothing to do.
    return false;
  end if;

  -- The endpoint must be able to receive it, or the retry would just fail
  -- again with "Endpoint is disabled" and count against its health.
  if not exists (select 1 from webhook_endpoints where id = v_delivery.endpoint_id and is_active) then
    raise exception 'Enable the endpoint before retrying deliveries to it';
  end if;

  update webhook_deliveries
  set status = 'pending',
      attempts = 0,
      next_attempt_at = now()
  where id = p_delivery_id;

  return true;
end;
$$;

revoke execute on function retry_webhook_delivery(uuid) from public, anon;
grant execute on function retry_webhook_delivery(uuid) to authenticated;

-- ============================================================================
-- 3. Insert policies: the parent row must belong to the caller's company
-- ============================================================================

drop policy if exists "Staff insert own equipment events" on equipment_events;
create policy "Staff insert own equipment events" on equipment_events
  for insert with check (
    company_id = get_my_company_id()
    and exists (
      select 1 from equipment e
      where e.id = equipment_events.equipment_id
        and e.company_id = get_my_company_id()
    )
    and (
      service_request_id is null
      or exists (
        select 1 from service_requests sr
        where sr.id = equipment_events.service_request_id
          and sr.company_id = get_my_company_id()
      )
    )
  );

drop policy if exists "Staff insert own request activity" on request_activity;
create policy "Staff insert own request activity" on request_activity
  for insert with check (
    company_id = get_my_company_id()
    and exists (
      select 1 from service_requests sr
      where sr.id = request_activity.service_request_id
        and sr.company_id = get_my_company_id()
    )
  );

-- ============================================================================
-- 4. resolve_qr_code: custom fields flagged for the scan page
-- ============================================================================
-- Identical to the 0019 definition plus the `custom_fields` key on
-- `equipment`. Same signature, so `create or replace` keeps the grants.

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
      'next_service_due_on', e.next_service_due_on,
      -- Owner-defined fields flagged for the scan page, with a value, in
      -- the owner's order. Labels + text only: no keys, ids or help text.
      'custom_fields', coalesce((
        select json_agg(json_build_object(
          'label', cf.label,
          'value', case
            when cf.field_type = 'boolean' then
              case when (e.custom_fields -> cf.key)::text in ('true', '"true"') then 'Yes' else 'No' end
            else e.custom_fields ->> cf.key
          end
        ) order by cf.sort_order, cf.created_at)
        from equipment_custom_fields cf
        where cf.company_id = e.company_id
          and cf.show_on_scan_page
          and e.custom_fields ? cf.key
          and jsonb_typeof(e.custom_fields -> cf.key) <> 'null'
          and (e.custom_fields ->> cf.key) <> ''
      ), '[]'::json)
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

revoke execute on function resolve_qr_code(text) from public;
grant execute on function resolve_qr_code(text) to anon, authenticated;
