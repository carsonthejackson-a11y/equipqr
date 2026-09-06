-- 0025_next_security_hardening.sql
--
-- Security review follow-up on the Next roadmap (0019–0024). Additive: no
-- table changes, no drops except policies that are recreated stricter, no
-- signature changes.
--
-- 1. Cross-tenant read through the webhook outbox (HIGH). The insert policies
--    on equipment_events / request_activity (0013) only checked company_id,
--    never that equipment_id / service_request_id belong to that company, and
--    the 0019 fan-out triggers (security definer) then looked the parent row
--    up WITHOUT a company predicate and copied it into a webhook_deliveries
--    payload the inserting owner can read back. Any staff account holding a
--    foreign UUID (equipment ids are on every scan page) could read that
--    tenant's unit or request. Fixed at both layers: the policies now verify
--    the parent, and the triggers add the company predicate.
-- 2. Customer replies on long-resolved requests emailed staff forever (LOW):
--    replies close 14 days after resolution; get_request_status() says so.
-- 3. The active-endpoint cap lived only in the app (LOW): a DB trigger now
--    enforces it, so a direct PostgREST insert can't amplify fan-out.
-- 4. claim_webhook_deliveries() could lease 200 rows of one stalled endpoint
--    and starve everyone else's retries (MEDIUM): per-endpoint cap per claim,
--    plus release_webhook_deliveries() so a worker that runs out of time can
--    hand unattempted rows back without burning an attempt.
-- 5. webhook_endpoints.secret was selectable by the owner through PostgREST
--    (INFO): column-level revoke makes "shown once" true at the DB.

-- ============================================================================
-- 1a. Insert policies: the parent row must belong to the caller's company
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
-- 1b. Fan-out triggers: never read across the tenant boundary
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
-- 2. Customer replies close 14 days after resolution
-- ============================================================================

create or replace function request_accepts_replies(p_status request_status, p_resolved_at timestamptz)
returns boolean
language sql
stable
as $$
  select p_status <> 'canceled'
     and not (p_status = 'resolved' and p_resolved_at is not null and p_resolved_at < now() - interval '14 days');
$$;

revoke execute on function request_accepts_replies(request_status, timestamptz) from public;
grant execute on function request_accepts_replies(request_status, timestamptz) to anon, authenticated, service_role;

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
  if not request_accepts_replies(v_request.status, v_request.resolved_at) then
    raise exception 'This request was closed a while ago — please contact the company directly';
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

revoke execute on function add_request_customer_message(text, text) from public;
grant execute on function add_request_customer_message(text, text) to anon, authenticated, service_role;

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
    'can_reply', request_accepts_replies(sr.status, sr.resolved_at),
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

  return v_result;
end;
$$;

revoke execute on function get_request_status(text) from public;
grant execute on function get_request_status(text) to anon, authenticated;

-- ============================================================================
-- 3. Active-endpoint cap enforced in the database
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
-- 4. Fair leasing + hand-back
-- ============================================================================

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
-- 5. The signing secret never leaves the server
-- ============================================================================
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
-- 6. Lease one specific delivery ("Send test" must not wait on the backlog)
-- ============================================================================

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
