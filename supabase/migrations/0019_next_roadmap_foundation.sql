-- 0019_next_roadmap_foundation.sql
--
-- "Next" roadmap foundation. One additive, backward-compatible migration that
-- turns the hooks 0013 left behind into working schema, so the five Next
-- workstreams (see docs/NEXT-ROADMAP-BRIEF.md) can build on it in parallel:
--
--   1. PM reminders        — equipment.service_interval_days; a trigger keeps
--                            next_service_due_on in step with last_serviced_at;
--                            pm_reminder_sent_for de-dupes the daily job.
--   2. Custom fields       — equipment_custom_fields: the company-defined
--                            field definitions whose values live in
--                            equipment.custom_fields (jsonb, since 0013).
--   3. Two-way messaging   — add_request_customer_message(): the anon-callable
--                            RPC behind the reply box on /r/<token>, plus
--                            service_requests.last_customer_message_at /
--                            customer_messages_read_at for the inbox's
--                            "customer replied" indicator.
--   4. Outbound webhooks   — webhook_endpoints (owner-managed), and
--                            webhook_deliveries: an outbox filled by triggers
--                            on equipment_events / request_activity and
--                            drained by the app (src/lib/webhooks.ts) with
--                            HMAC-signed POSTs and retries.
--   5. Scheduling-lite     — needs nothing new: service_requests.scheduled_for,
--                            companies.timezone and the visit_scheduled event
--                            kind all exist since 0013.
--
-- Nothing is dropped or renamed. Every existing RPC keeps its signature.

-- ============================================================================
-- 1. PM reminders
-- ============================================================================

alter table equipment
  -- Time-based preventive maintenance: "service this every N days". Null
  -- means the unit is not on a schedule; next_service_due_on is then free
  -- text (a manually set date) or null.
  add column if not exists service_interval_days int
    check (service_interval_days is null or (service_interval_days between 1 and 3650)),
  -- The due date the last reminder went out for. The daily job only emails
  -- when this differs from next_service_due_on, so one due date = one
  -- reminder, however many days it stays overdue.
  add column if not exists pm_reminder_sent_for date;

comment on column equipment.service_interval_days is
  'Preventive-maintenance interval in days. When set, next_service_due_on is recomputed from last_serviced_at (or install_date) on every change.';
comment on column equipment.pm_reminder_sent_for is
  'The next_service_due_on value the last PM reminder email covered. Prevents the daily job from repeating itself.';

-- Keeps next_service_due_on honest for units on an interval, whichever code
-- path moved last_serviced_at (the resolve trigger, "Log service", the API).
-- Units without an interval are left alone so a hand-set date survives.
create or replace function equipment_compute_next_service_due()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_base date;
begin
  if new.service_interval_days is null then
    return new;
  end if;

  if tg_op = 'INSERT'
     or new.service_interval_days is distinct from old.service_interval_days
     or new.last_serviced_at is distinct from old.last_serviced_at
     or new.install_date is distinct from old.install_date
     or new.next_service_due_on is null
  then
    v_base := coalesce(new.last_serviced_at::date, new.install_date, current_date);
    new.next_service_due_on := v_base + new.service_interval_days;
  end if;

  return new;
end;
$$;

revoke execute on function equipment_compute_next_service_due() from public, anon, authenticated;

drop trigger if exists equipment_compute_next_service_due on equipment;
create trigger equipment_compute_next_service_due
  before insert or update on equipment
  for each row execute function equipment_compute_next_service_due();

-- ============================================================================
-- 2. Custom fields: company-defined field definitions
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
-- 3. Two-way messaging: the customer replies on /r/<token>
-- ============================================================================

alter table service_requests
  -- When the customer last wrote in. Null until they do.
  add column if not exists last_customer_message_at timestamptz,
  -- When staff last opened the request's detail page. A request has an
  -- unread customer message when last_customer_message_at > this.
  add column if not exists customer_messages_read_at timestamptz;

create index service_requests_unread_customer_msg_idx
  on service_requests (company_id, last_customer_message_at desc)
  where last_customer_message_at is not null;

-- Anon-callable. The unguessable public_token is the whole credential, the
-- same one that already unlocks get_request_status(). Refuses canceled
-- requests (nobody is listening) and empty / oversize bodies. Returns what
-- the app needs to tell staff — the notification inbox only to the service
-- role, mirroring submit_service_request() after 0018.
create or replace function add_request_customer_message(p_public_token text, p_body text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request service_requests;
  v_body text := trim(coalesce(p_body, ''));
  v_activity_id uuid;
  v_result json;
  v_is_service_role boolean := is_service_role();
begin
  if v_body = '' then
    raise exception 'Message can''t be empty';
  end if;
  if length(v_body) > 2000 then
    raise exception 'Message is too long (2000 characters max)';
  end if;

  select * into v_request from service_requests where public_token = p_public_token;
  if v_request.id is null then
    raise exception 'Unknown request';
  end if;
  if v_request.status = 'canceled' then
    raise exception 'This request was canceled — please contact the company directly';
  end if;

  insert into request_activity (company_id, service_request_id, kind, visibility, body, author_kind)
  values (v_request.company_id, v_request.id, 'message', 'customer', v_body, 'customer')
  returning id into v_activity_id;

  update service_requests
  set last_customer_message_at = now()
  where id = v_request.id;

  select json_build_object(
    'activity_id', v_activity_id,
    'request_id', v_request.id,
    'company_id', c.id,
    'company_name', c.name,
    'company_notification_email', case when v_is_service_role then c.notification_email else null end,
    'assigned_to', v_request.assigned_to,
    'equipment_name', e.name,
    'contact_name', v_request.contact_name,
    'status', v_request.status
  )
  into v_result
  from companies c
  join equipment e on e.id = v_request.equipment_id
  where c.id = v_request.company_id;

  return v_result;
end;
$$;

comment on function add_request_customer_message(text, text) is
  'Anon-callable from POST /api/request-messages: appends a customer-visible message to the request the token identifies.';

revoke execute on function add_request_customer_message(text, text) from public;
grant execute on function add_request_customer_message(text, text) to anon, authenticated, service_role;

-- ============================================================================
-- 4. Outbound webhooks
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
-- 5. get_request_status: timezone for the visit time, and whether replies
--    are open
-- ============================================================================
--
-- Identical to the 0015 definition plus two keys. `company_timezone` lets
-- /r/<token> print a scheduled visit in the company's local time (the page
-- renders on a UTC server); `can_reply` tells it whether to show the reply
-- box (mirrors add_request_customer_message()'s own check).

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
      'id', c.id,
      'name', c.name,
      'phone', c.phone,
      'sms_number', c.sms_number,
      'logo_path', c.logo_path,
      'brand_color', c.brand_color
    ),
    'company_timezone', c.timezone,
    'can_reply', sr.status <> 'canceled',
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
