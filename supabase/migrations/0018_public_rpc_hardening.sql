-- 0018_public_rpc_hardening.sql
--
-- Security review follow-up on the two RPCs the anonymous internet can call.
-- Purely additive: no table changes, no drops, no signature changes.
--
-- 1. submit_service_request() has returned `company_notification_email` since
--    0001 and is granted to `anon`. Anyone holding the public anon key (it
--    ships in the browser bundle by design) could submit a request against
--    any sticker and read the company's internal notification inbox back out
--    of the response. The address is only ever needed by the server that
--    sends the staff notification email, so it is now returned ONLY to the
--    service role; every other caller gets null for that key.
--
-- 2. check_rate_limit() took a caller-supplied key AND limit and was granted
--    to `anon`. That let anyone pre-fill the `sr:ip:<victim>` / `sr:tok:<code>`
--    buckets and 429 real customers off the request form (or, with a huge
--    p_limit, hand themselves an unlimited bucket). It is now service-role
--    only — the app calls it through the admin client.

-- ============================================================================
-- 1. is_service_role(): "was this call made with the service-role key?"
-- ============================================================================
-- PostgREST puts the verified JWT on the connection as GUCs before it calls
-- anything: `request.jwt.claim.<name>` on older versions, the whole claim set
-- as JSON in `request.jwt.claims` on newer ones. Read both, tolerate neither
-- being set (a direct psql session), and never throw — a malformed claims
-- blob must degrade to "not the service role", not to an error on the one
-- write path the public internet uses.
--
-- Local shim note: `scripts/local-db/db.sh` has no PostgREST in front of it,
-- so a psql session impersonates the service role with
--     set request.jwt.claim.role = 'service_role';
-- (and `reset request.jwt.claim.role` to drop back). See scripts/local-db/smoke.sql.
create or replace function is_service_role()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  begin
    v_role := coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::json->>'role'
    );
  exception
    when others then
      return false;
  end;

  return coalesce(v_role = 'service_role', false);
end;
$$;

comment on function is_service_role() is
  'True when the current request carries the service-role JWT claim. Used to gate fields that must never reach an anon caller.';

revoke execute on function is_service_role() from public;
grant execute on function is_service_role() to anon, authenticated, service_role;

-- ============================================================================
-- 2. submit_service_request: stop leaking companies.notification_email
-- ============================================================================
-- Same signature as 0013 §11b, so `create or replace` is enough (no drop, and
-- existing grants carry over). The only change is the
-- `company_notification_email` key: service role gets the address, everyone
-- else gets null. The key itself stays in the payload so the response shape
-- is unchanged for callers.
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
  v_is_service_role boolean := is_service_role();
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
    -- Internal inbox: service role only (see header).
    'company_notification_email', case when v_is_service_role then c.notification_email else null end,
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

-- Re-asserted rather than assumed: `create or replace` keeps the 0013 grants,
-- but stating them here means this file alone describes who may call it.
revoke execute on function submit_service_request(text, text, text, text, text, jsonb, jsonb, text) from public;
grant execute on function submit_service_request(text, text, text, text, text, jsonb, jsonb, text) to anon, authenticated, service_role;

-- ============================================================================
-- 3. check_rate_limit: service role only
-- ============================================================================
-- The limiter is server-side infrastructure, not a public API. Both the key
-- and the limit come from the caller, so exposing it to `anon` let an
-- attacker either poison another visitor's bucket or grant themselves one.
-- src/lib/rate-limit.ts now calls it through the admin client (and fails
-- OPEN with a warning when no service-role key is configured).
revoke execute on function check_rate_limit(text, int, int) from anon, authenticated;
grant execute on function check_rate_limit(text, int, int) to service_role;

comment on function check_rate_limit(text, int, int) is
  'Fixed-window rate limiter. Service role only: the caller chooses both the bucket key and the limit.';
