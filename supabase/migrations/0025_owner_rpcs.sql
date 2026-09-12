-- 0025_owner_rpcs.sql
--
-- Owner roadmap RPCs (Phase 1, Model A — see docs/OWNER-ROADMAP-BRIEF.md §2.2):
--
--   1. resolve_qr_code() v5 — same signature, four new keys, no vendor
--      details (those only ever come back from a real submission).
--   2. verify_site_pin() — checks a location's site PIN server-side and
--      hands back an opaque, expiring pass; never echoes the PIN itself.
--   3. submit_owner_service_request() — the owner-kind sibling of
--      submit_service_request(), a NEW function (not an overload — see the
--      0010 comment on why a stale overload is worse than a new name).
--      Resolves a vendor (warranty > unit > category default > none) and
--      creates a dispatch when one is found with an email.
--   4. Vendor-token RPCs behind /v/<token>: get_vendor_dispatch and five
--      action RPCs (acknowledge / eta / note / finish / decline), plus
--      vendor_attach_dispatch_invoice (service-role only, called from the
--      upload route after the file lands in storage).
--   5. mark_dispatch_sent() / claim_dispatch_sla_alerts() — service-role-only
--      plumbing for the API route and the hourly dispatch-sla cron.
--
-- Every function here is `language plpgsql`, `security definer`,
-- `set search_path = public`; only the two stable readers (resolve_qr_code,
-- get_company_plan_flags in 0024) are `stable`. None of them accept a
-- company id, vendor id, or location id from the caller — the tenant is
-- always resolved server-side from a token.

-- ============================================================================
-- 1. resolve_qr_code(p_token text) returns json — v5
-- ============================================================================
--
-- Same signature as 0023 -> create or replace keeps its existing grants. The
-- 0023 body plus four new keys, nothing removed/renamed/reordered:
--   company.kind, equipment_type.symptom_chips, guide.location,
--   guide.site_pin_required.
--
-- Vendor details are NOT exposed here on purpose: the sticker is physically
-- public, and publishing a vendor's phone/email to anyone who walks past a
-- machine is a spam/social-engineering vector. The vendor's name and phone
-- only come back from submit_owner_service_request() — i.e. only after a
-- real submission that has already passed the PIN gate when one exists.
-- The vendor's email is never returned to a non-service-role caller at all.

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
      'brand_color', c.brand_color,
      'timezone', c.timezone,
      'kind', c.kind
    ),
    'equipment_type', json_build_object(
      'id', et.id, 'name', et.name, 'description', et.description,
      'symptom_chips', coalesce(et.symptom_chips, '{}'::text[])
    ),
    'code', json_build_object(
      'short_code', v_code.short_code,
      'status', v_code.status
    ),
    -- Owner-kind: the unit's site, name only. No address/phone/hours/PIN.
    'location', (
      select json_build_object('id', l.id, 'name', l.name)
      from locations l
      where l.id = e.location_id
    ),
    -- True iff this is an owner-kind company AND the unit's location has a
    -- site PIN set. Leaks only the fact that a PIN exists, which the poster
    -- on the wall already says.
    'site_pin_required', (
      c.kind = 'equipment_owner'
      and exists (select 1 from locations l where l.id = e.location_id and l.site_pin is not null)
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

comment on function resolve_qr_code(text) is
  'Anon-callable public scan page reader. v5 adds company.kind, equipment_type.symptom_chips, location and site_pin_required for owner-kind companies. Never returns a vendor or a site_pin.';

-- ============================================================================
-- 2. verify_site_pin(p_qr_token text, p_pin text) returns json
-- ============================================================================

create or replace function verify_site_pin(p_qr_token text, p_pin text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code qr_codes;
  v_equipment equipment;
  v_company companies;
  v_location locations;
  v_pass text;
begin
  v_code := find_qr_code(p_qr_token);

  -- Unknown token: no oracle for whether a sticker exists.
  if v_code.id is null or v_code.equipment_id is null then
    return json_build_object('ok', false, 'pass', null, 'location_name', null);
  end if;

  select * into v_equipment from equipment where id = v_code.equipment_id;
  select * into v_company from companies where id = v_equipment.company_id;

  if v_equipment.location_id is not null then
    select * into v_location from locations where id = v_equipment.location_id;
  end if;

  -- Nothing to verify: not an owner-kind company, or the location has no PIN.
  if v_company.kind <> 'equipment_owner' or v_location.id is null or v_location.site_pin is null then
    return json_build_object('ok', true, 'pass', null, 'location_name', v_location.name);
  end if;

  -- Rate limits BEFORE the comparison. check_rate_limit() is service-role
  -- only (0018/0019) but this function runs as its owner, the same trick
  -- add_customer_request_update() uses.
  if not check_rate_limit('pin:loc:' || v_location.id::text, 30, 3600)
     or not check_rate_limit('pin:tok:' || p_qr_token, 15, 3600) then
    raise exception 'Too many attempts — try again later' using errcode = '54000';
  end if;

  -- A 4-8 digit shared code on a kitchen wall, not a password hash: a plain
  -- comparison is an accepted trade-off (see docs/OWNER-ROADMAP-BRIEF.md §7.3).
  if v_location.site_pin = btrim(p_pin) then
    insert into site_pin_passes (company_id, location_id)
    values (v_location.company_id, v_location.id)
    returning token into v_pass;

    return json_build_object('ok', true, 'pass', v_pass, 'location_name', v_location.name);
  end if;

  -- Never echo the PIN, its length, or any hint.
  return json_build_object('ok', false, 'pass', null, 'location_name', null);
end;
$$;

revoke execute on function verify_site_pin(text, text) from public;
grant execute on function verify_site_pin(text, text) to anon, authenticated, service_role;

comment on function verify_site_pin(text, text) is
  'Anon-callable. Rate-limited per location (pin:loc:, 30/h) and per sticker (pin:tok:, 15/h), checked before comparison. Never returns the PIN or a hint; hands back an opaque site_pin_passes token on a match.';

-- ============================================================================
-- 3. submit_owner_service_request(...) returns json
-- ============================================================================
--
-- A NEW function, not an overload of submit_service_request() — that one
-- keeps its exact 8-argument signature/body and stays the provider path.

create or replace function submit_owner_service_request(
  p_qr_token        text,
  p_description     text,
  p_contact_name    text,
  p_reporter_phone  text    default null,
  p_symptoms        text[]  default '{}'::text[],
  p_priority        text    default 'normal',
  p_media           jsonb   default '[]'::jsonb,
  p_pin_pass        text    default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code qr_codes;
  v_equipment equipment;
  v_company companies;
  v_location locations;
  v_description text := btrim(coalesce(p_description, ''));
  v_contact_name text := btrim(coalesce(p_contact_name, ''));
  v_reporter_phone text := nullif(btrim(coalesce(p_reporter_phone, '')), '');
  v_symptoms text[] := coalesce(p_symptoms, '{}'::text[]);
  v_symptom text;
  v_symptom_count int := 0;
  v_troubleshooting jsonb := '[]'::jsonb;
  v_priority text;
  v_request_id uuid;
  v_public_token text;
  v_item jsonb;
  v_candidate vendors;
  v_vendor vendors;
  v_vendor_source text := 'none';
  v_dispatch_id uuid;
  v_dispatch_token text;
  v_is_service_role boolean := is_service_role();
  v_result json;
begin
  v_code := find_qr_code(p_qr_token);
  if v_code.id is null or v_code.equipment_id is null then
    raise exception 'Unknown equipment';
  end if;

  select * into v_equipment from equipment where id = v_code.equipment_id;
  select * into v_company from companies where id = v_equipment.company_id;

  if v_company.kind <> 'equipment_owner' then
    raise exception 'This code belongs to a service company' using errcode = 'P0003';
  end if;

  if length(v_description) < 1 or length(v_description) > 4000 then
    raise exception 'Description must be between 1 and 4000 characters' using errcode = '22023';
  end if;
  if length(v_contact_name) < 1 or length(v_contact_name) > 120 then
    raise exception 'Name must be between 1 and 120 characters' using errcode = '22023';
  end if;

  if v_equipment.location_id is not null then
    select * into v_location from locations where id = v_equipment.location_id;
  end if;

  -- PIN gate: only when the unit's location actually has a site_pin set.
  if v_location.id is not null and v_location.site_pin is not null then
    if p_pin_pass is null or not exists (
      select 1 from site_pin_passes
      where token = p_pin_pass and location_id = v_location.id and expires_at > now()
    ) then
      raise exception 'A site code is required' using errcode = 'P0004';
    end if;

    update site_pin_passes set last_used_at = now()
    where token = p_pin_pass and location_id = v_location.id;
  end if;

  -- Backstop against a direct anon-key call bypassing the API route's own
  -- per-IP/per-token limits.
  if not check_rate_limit('osr:rpc:' || v_code.id::text, 30, 3600) then
    raise exception 'Too many requests — try again later' using errcode = '54000';
  end if;

  -- 'urgent' is never accepted from this path, same rule as the provider form.
  v_priority := case when p_priority in ('low', 'normal', 'high') then p_priority else 'normal' end;

  if array_length(v_symptoms, 1) is not null then
    foreach v_symptom in array v_symptoms[1:12]
    loop
      v_troubleshooting := v_troubleshooting
        || jsonb_build_object('question', 'Symptom', 'answer', left(v_symptom, 120));
      v_symptom_count := v_symptom_count + 1;
    end loop;
  end if;

  insert into service_requests (
    company_id, equipment_id, customer_id, location_id, source,
    contact_name, contact_email, contact_phone, reporter_phone,
    description, troubleshooting_path, priority,
    requires_approval, approved_at
  )
  values (
    v_equipment.company_id, v_equipment.id, v_equipment.customer_id, v_equipment.location_id, 'scan',
    v_contact_name, null, v_reporter_phone, v_reporter_phone,
    v_description, v_troubleshooting, v_priority,
    false, now()
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
    'Service request submitted by ' || v_contact_name,
    jsonb_build_object('priority', v_priority, 'media_count', jsonb_array_length(p_media), 'symptom_count', v_symptom_count),
    v_request_id, 'customer'
  );

  insert into request_activity (company_id, service_request_id, kind, visibility, body, author_kind)
  values (v_equipment.company_id, v_request_id, 'status_change', 'customer', 'Request received', 'system');

  -- Vendor resolution: warranty > unit > category default > none. Any
  -- resolved vendor with active = false falls through to the next tier
  -- rather than stopping resolution outright.
  if v_equipment.warranty_vendor_id is not null
     and v_equipment.warranty_ends_on is not null
     and v_equipment.warranty_ends_on >= current_date then
    select * into v_candidate from vendors where id = v_equipment.warranty_vendor_id and active;
    if v_candidate.id is not null then
      v_vendor := v_candidate;
      v_vendor_source := 'warranty';
    end if;
  end if;

  if v_vendor.id is null and v_equipment.vendor_id is not null then
    select * into v_candidate from vendors where id = v_equipment.vendor_id and active;
    if v_candidate.id is not null then
      v_vendor := v_candidate;
      v_vendor_source := 'unit';
    end if;
  end if;

  if v_vendor.id is null then
    select v.* into v_candidate
    from category_default_vendors cdv
    join vendors v on v.id = cdv.vendor_id and v.active
    where cdv.company_id = v_equipment.company_id
      and cdv.equipment_type_id = v_equipment.equipment_type_id;
    if v_candidate.id is not null then
      v_vendor := v_candidate;
      v_vendor_source := 'category';
    end if;
  end if;

  if v_vendor.id is not null and v_vendor.email is not null then
    insert into dispatches (company_id, service_request_id, vendor_id, channel, status)
    values (v_equipment.company_id, v_request_id, v_vendor.id, 'email', 'sent')
    returning id, token into v_dispatch_id, v_dispatch_token;

    insert into request_activity (company_id, service_request_id, kind, visibility, body, author_kind, metadata)
    values (
      v_equipment.company_id, v_request_id, 'dispatch', 'customer', 'Sent to ' || v_vendor.name, 'system',
      jsonb_build_object('action', 'created', 'vendor_id', v_vendor.id, 'vendor_name', v_vendor.name, 'dispatch_id', v_dispatch_id)
    );
  end if;

  select json_build_object(
    'request_id', v_request_id,
    'public_token', v_public_token,
    'company_id', v_company.id,
    'company_name', v_company.name,
    'company_notification_email', case when v_is_service_role then v_company.notification_email else null end,
    'company_phone', v_company.phone,
    'company_logo_path', v_company.logo_path,
    'company_brand_color', v_company.brand_color,
    'customer_updates_enabled', v_company.customer_updates_enabled,
    'equipment_id', v_equipment.id,
    'equipment_name', v_equipment.name,
    'location_name', v_location.name,
    'vendor_source', v_vendor_source,
    'vendor', case when v_vendor.id is not null
      then json_build_object('id', v_vendor.id, 'name', v_vendor.name, 'phone', v_vendor.phone)
      else null end,
    'vendor_email', case when v_is_service_role then v_vendor.email else null end,
    'dispatch_id', case when v_is_service_role then v_dispatch_id else null end,
    'dispatch_token', case when v_is_service_role then v_dispatch_token else null end
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function submit_owner_service_request(text, text, text, text, text[], text, jsonb, text) from public;
grant execute on function submit_owner_service_request(text, text, text, text, text[], text, jsonb, text)
  to anon, authenticated, service_role;

comment on function submit_owner_service_request(text, text, text, text, text[], text, jsonb, text) is
  'Anon-callable owner-kind report submission. Rate-limited per QR code (osr:rpc:, 30/h; the API route also limits per IP/token). dispatch_id/dispatch_token/vendor_email/company_notification_email are is_service_role()-gated — the reporter must never receive the token that acts as the vendor.';

-- ============================================================================
-- 4. Vendor-token RPCs (/v/<token>)
-- ============================================================================
--
-- Shared preamble, duplicated in each function below rather than factored
-- out: look the dispatch up by token (P0002 if not found); reject a
-- declined dispatch or a resolved/canceled parent request (P0001); rate
-- limit per dispatch (vd:, 60/h). Every write appends one request_activity
-- row (kind='dispatch', visibility='customer', author_kind='vendor') and
-- returns a notify payload the API route forwards into
-- buildOwnerDispatchUpdateEmail(): { action, dispatch_id, status, request_id,
-- request_public_token, vendor_id, vendor_name, eta_at, vendor_note,
-- decline_reason, equipment_id, equipment_name, location_name, company_id,
-- company_name, company_notification_email }. company_notification_email is
-- is_service_role()-gated, same rule as everywhere else in this build.

-- ----------------------------------------------------------------------------
-- 4a. get_vendor_dispatch(p_token text) returns json
-- ----------------------------------------------------------------------------
-- Not `stable`: on the very first open it stamps viewed_at/status.

create or replace function get_vendor_dispatch(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dispatch dispatches;
  v_request service_requests;
  v_vendor vendors;
  v_result json;
begin
  select * into v_dispatch from dispatches where token = p_token;
  if v_dispatch.id is null then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;

  select * into v_request from service_requests where id = v_dispatch.service_request_id;

  if v_dispatch.status = 'declined' or v_request.status in ('resolved', 'canceled') then
    raise exception 'This request is closed' using errcode = 'P0001';
  end if;

  if not check_rate_limit('vd:' || v_dispatch.id::text, 60, 3600) then
    raise exception 'Too many requests — try again later' using errcode = '54000';
  end if;

  select * into v_vendor from vendors where id = v_dispatch.vendor_id;

  if v_dispatch.status = 'sent' then
    update dispatches set viewed_at = coalesce(viewed_at, now()), status = 'viewed'
    where id = v_dispatch.id
    returning * into v_dispatch;
  end if;

  select json_build_object(
    'dispatch', json_build_object(
      'id', v_dispatch.id,
      'status', v_dispatch.status,
      'eta_at', v_dispatch.eta_at,
      'vendor_notes', v_dispatch.vendor_notes,
      'decline_reason', v_dispatch.decline_reason,
      'invoice_path', v_dispatch.invoice_path,
      'sent_at', v_dispatch.sent_at,
      'acknowledged_at', v_dispatch.acknowledged_at,
      'finished_at', v_dispatch.finished_at,
      'created_at', v_dispatch.created_at
    ),
    'vendor', json_build_object(
      'id', v_vendor.id, 'name', v_vendor.name, 'account_number', v_vendor.account_number,
      'ack_sla_minutes', v_vendor.ack_sla_minutes
    ),
    'owner', json_build_object(
      'company_name', c.name, 'phone', c.phone, 'contact_email', c.notification_email, 'timezone', c.timezone
    ),
    'request', json_build_object(
      'public_token', v_request.public_token, 'status', v_request.status, 'priority', v_request.priority,
      'description', v_request.description, 'created_at', v_request.created_at,
      'contact_name', v_request.contact_name, 'reporter_phone', v_request.reporter_phone,
      'symptoms', coalesce((
        select json_agg(elem ->> 'answer')
        from jsonb_array_elements(v_request.troubleshooting_path) as elem
      ), '[]'::json)
    ),
    'equipment', json_build_object(
      'name', e.name, 'make', e.make, 'model', e.model, 'serial_number', e.serial_number,
      'location', e.location, 'status', e.status, 'warranty_ends_on', e.warranty_ends_on,
      'in_warranty', (e.warranty_ends_on is not null and e.warranty_ends_on >= current_date)
    ),
    'location', case when l.id is not null
      then json_build_object('name', l.name, 'address', l.address, 'phone', l.phone, 'hours', l.hours)
      else null end,
    'media', coalesce((
      select json_agg(json_build_object(
        'index', m.idx - 1,
        'media_type', m.media_type
      ))
      from (
        select srm.media_type, row_number() over (order by srm.created_at, srm.id) as idx
        from service_request_media srm
        where srm.service_request_id = v_request.id
      ) m
    ), '[]'::json),
    'activity', coalesce((
      select json_agg(json_build_object(
        'kind', ra.kind, 'body', ra.body, 'author_kind', ra.author_kind,
        'author_name', ra.metadata ->> 'author_name', 'created_at', ra.created_at
      ) order by ra.created_at)
      from request_activity ra
      where ra.service_request_id = v_request.id and ra.visibility = 'customer'
    ), '[]'::json)
  )
  into v_result
  from equipment e
  join companies c on c.id = e.company_id
  left join locations l on l.id = e.location_id
  where e.id = v_request.equipment_id;

  return v_result;
end;
$$;

revoke execute on function get_vendor_dispatch(text) from public;
grant execute on function get_vendor_dispatch(text) to anon, authenticated, service_role;

comment on function get_vendor_dispatch(text) is
  'Anon-callable vendor dispatch page reader. Rate-limited per dispatch (vd:, 60/h). Returns exactly one request/unit/vendor/location — never a storage path, cost_cents, internal activity, or vendors.email.';

-- ----------------------------------------------------------------------------
-- 4b. vendor_acknowledge_dispatch(p_token text, p_note text default null)
-- ----------------------------------------------------------------------------

create or replace function vendor_acknowledge_dispatch(p_token text, p_note text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dispatch dispatches;
  v_request service_requests;
  v_vendor vendors;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_result json;
begin
  select * into v_dispatch from dispatches where token = p_token;
  if v_dispatch.id is null then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;

  select * into v_request from service_requests where id = v_dispatch.service_request_id;

  if v_dispatch.status = 'declined' or v_request.status in ('resolved', 'canceled') then
    raise exception 'This request is closed' using errcode = 'P0001';
  end if;

  if not check_rate_limit('vd:' || v_dispatch.id::text, 60, 3600) then
    raise exception 'Too many requests — try again later' using errcode = '54000';
  end if;

  select * into v_vendor from vendors where id = v_dispatch.vendor_id;

  update dispatches
  set status = 'acknowledged',
      acknowledged_at = now(),
      vendor_notes = case when v_note is not null
        then left(coalesce(vendor_notes || E'\n', '') || v_note, 8000)
        else vendor_notes end
  where id = v_dispatch.id
  returning * into v_dispatch;

  update service_requests set status = 'in_progress' where id = v_request.id and status = 'new';

  insert into request_activity (company_id, service_request_id, kind, visibility, body, author_kind, metadata)
  values (
    v_request.company_id, v_request.id, 'dispatch', 'customer',
    v_vendor.name || ' acknowledged the work order', 'vendor',
    jsonb_strip_nulls(jsonb_build_object(
      'action', 'acknowledge', 'vendor_id', v_vendor.id, 'vendor_name', v_vendor.name,
      'dispatch_id', v_dispatch.id, 'note', v_note
    ))
  );

  select json_build_object(
    'action', 'acknowledge', 'dispatch_id', v_dispatch.id, 'status', v_dispatch.status,
    'request_id', v_request.id, 'request_public_token', v_request.public_token,
    'vendor_id', v_vendor.id, 'vendor_name', v_vendor.name,
    'eta_at', v_dispatch.eta_at, 'vendor_note', v_note, 'decline_reason', null,
    'equipment_id', e.id, 'equipment_name', e.name, 'location_name', l.name,
    'company_id', c.id, 'company_name', c.name,
    'company_notification_email', case when is_service_role() then c.notification_email else null end
  )
  into v_result
  from equipment e
  join companies c on c.id = e.company_id
  left join locations l on l.id = e.location_id
  where e.id = v_request.equipment_id;

  return v_result;
end;
$$;

revoke execute on function vendor_acknowledge_dispatch(text, text) from public;
grant execute on function vendor_acknowledge_dispatch(text, text) to anon, authenticated, service_role;

comment on function vendor_acknowledge_dispatch(text, text) is
  'Anon-callable. Rate-limited per dispatch (vd:, 60/h). Moves a new request to in_progress and appends one customer-visible, vendor-authored activity row.';

-- ----------------------------------------------------------------------------
-- 4c. vendor_set_dispatch_eta(p_token text, p_eta_at timestamptz, p_note text default null)
-- ----------------------------------------------------------------------------

create or replace function vendor_set_dispatch_eta(p_token text, p_eta_at timestamptz, p_note text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dispatch dispatches;
  v_request service_requests;
  v_vendor vendors;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_result json;
begin
  select * into v_dispatch from dispatches where token = p_token;
  if v_dispatch.id is null then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;

  select * into v_request from service_requests where id = v_dispatch.service_request_id;

  if v_dispatch.status = 'declined' or v_request.status in ('resolved', 'canceled') then
    raise exception 'This request is closed' using errcode = 'P0001';
  end if;

  if not check_rate_limit('vd:' || v_dispatch.id::text, 60, 3600) then
    raise exception 'Too many requests — try again later' using errcode = '54000';
  end if;

  if p_eta_at is null or p_eta_at < now() or p_eta_at > now() + interval '90 days' then
    raise exception 'ETA must be a time in the future, within 90 days' using errcode = '22023';
  end if;

  select * into v_vendor from vendors where id = v_dispatch.vendor_id;

  update dispatches
  set status = 'eta_given',
      eta_at = p_eta_at,
      acknowledged_at = coalesce(acknowledged_at, now()),
      vendor_notes = case when v_note is not null
        then left(coalesce(vendor_notes || E'\n', '') || v_note, 8000)
        else vendor_notes end
  where id = v_dispatch.id
  returning * into v_dispatch;

  insert into request_activity (company_id, service_request_id, kind, visibility, body, author_kind, metadata)
  values (
    v_request.company_id, v_request.id, 'dispatch', 'customer',
    v_vendor.name || ' gave an ETA', 'vendor',
    jsonb_strip_nulls(jsonb_build_object(
      'action', 'eta', 'vendor_id', v_vendor.id, 'vendor_name', v_vendor.name,
      'dispatch_id', v_dispatch.id, 'eta_at', v_dispatch.eta_at, 'note', v_note
    ))
  );

  select json_build_object(
    'action', 'eta', 'dispatch_id', v_dispatch.id, 'status', v_dispatch.status,
    'request_id', v_request.id, 'request_public_token', v_request.public_token,
    'vendor_id', v_vendor.id, 'vendor_name', v_vendor.name,
    'eta_at', v_dispatch.eta_at, 'vendor_note', v_note, 'decline_reason', null,
    'equipment_id', e.id, 'equipment_name', e.name, 'location_name', l.name,
    'company_id', c.id, 'company_name', c.name,
    'company_notification_email', case when is_service_role() then c.notification_email else null end
  )
  into v_result
  from equipment e
  join companies c on c.id = e.company_id
  left join locations l on l.id = e.location_id
  where e.id = v_request.equipment_id;

  return v_result;
end;
$$;

revoke execute on function vendor_set_dispatch_eta(text, timestamptz, text) from public;
grant execute on function vendor_set_dispatch_eta(text, timestamptz, text) to anon, authenticated, service_role;

comment on function vendor_set_dispatch_eta(text, timestamptz, text) is
  'Anon-callable. Rate-limited per dispatch (vd:, 60/h). Rejects a null, past, or >90-day-out ETA (22023).';

-- ----------------------------------------------------------------------------
-- 4d. vendor_add_dispatch_note(p_token text, p_body text)
-- ----------------------------------------------------------------------------

create or replace function vendor_add_dispatch_note(p_token text, p_body text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dispatch dispatches;
  v_request service_requests;
  v_vendor vendors;
  v_body text := btrim(coalesce(p_body, ''));
  v_result json;
begin
  select * into v_dispatch from dispatches where token = p_token;
  if v_dispatch.id is null then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;

  select * into v_request from service_requests where id = v_dispatch.service_request_id;

  if v_dispatch.status = 'declined' or v_request.status in ('resolved', 'canceled') then
    raise exception 'This request is closed' using errcode = 'P0001';
  end if;

  if not check_rate_limit('vd:' || v_dispatch.id::text, 60, 3600) then
    raise exception 'Too many requests — try again later' using errcode = '54000';
  end if;

  if length(v_body) < 2 or length(v_body) > 2000 then
    raise exception 'Note must be between 2 and 2000 characters' using errcode = '22023';
  end if;

  select * into v_vendor from vendors where id = v_dispatch.vendor_id;

  update dispatches
  set vendor_notes = left(coalesce(vendor_notes || E'\n', '') || v_body, 8000)
  where id = v_dispatch.id
  returning * into v_dispatch;

  insert into request_activity (company_id, service_request_id, kind, visibility, body, author_kind, metadata)
  values (
    v_request.company_id, v_request.id, 'dispatch', 'customer',
    v_vendor.name || ' added a note', 'vendor',
    jsonb_build_object('action', 'note', 'vendor_id', v_vendor.id, 'vendor_name', v_vendor.name,
      'dispatch_id', v_dispatch.id, 'note', v_body)
  );

  select json_build_object(
    'action', 'note', 'dispatch_id', v_dispatch.id, 'status', v_dispatch.status,
    'request_id', v_request.id, 'request_public_token', v_request.public_token,
    'vendor_id', v_vendor.id, 'vendor_name', v_vendor.name,
    'eta_at', v_dispatch.eta_at, 'vendor_note', v_body, 'decline_reason', null,
    'equipment_id', e.id, 'equipment_name', e.name, 'location_name', l.name,
    'company_id', c.id, 'company_name', c.name,
    'company_notification_email', case when is_service_role() then c.notification_email else null end
  )
  into v_result
  from equipment e
  join companies c on c.id = e.company_id
  left join locations l on l.id = e.location_id
  where e.id = v_request.equipment_id;

  return v_result;
end;
$$;

revoke execute on function vendor_add_dispatch_note(text, text) from public;
grant execute on function vendor_add_dispatch_note(text, text) to anon, authenticated, service_role;

comment on function vendor_add_dispatch_note(text, text) is
  'Anon-callable. Rate-limited per dispatch (vd:, 60/h). Appends to vendor_notes (newline-joined, capped at 8000 chars). Does not change dispatch status.';

-- ----------------------------------------------------------------------------
-- 4e. vendor_finish_dispatch(p_token text, p_note text default null)
-- ----------------------------------------------------------------------------

create or replace function vendor_finish_dispatch(p_token text, p_note text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dispatch dispatches;
  v_request service_requests;
  v_vendor vendors;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_result json;
begin
  select * into v_dispatch from dispatches where token = p_token;
  if v_dispatch.id is null then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;

  select * into v_request from service_requests where id = v_dispatch.service_request_id;

  if v_dispatch.status = 'declined' or v_request.status in ('resolved', 'canceled') then
    raise exception 'This request is closed' using errcode = 'P0001';
  end if;

  if not check_rate_limit('vd:' || v_dispatch.id::text, 60, 3600) then
    raise exception 'Too many requests — try again later' using errcode = '54000';
  end if;

  select * into v_vendor from vendors where id = v_dispatch.vendor_id;

  -- Does NOT touch service_requests.status — closing the request out stays a
  -- staff decision.
  update dispatches
  set status = 'finished',
      finished_at = now(),
      vendor_notes = case when v_note is not null
        then left(coalesce(vendor_notes || E'\n', '') || v_note, 8000)
        else vendor_notes end
  where id = v_dispatch.id
  returning * into v_dispatch;

  insert into request_activity (company_id, service_request_id, kind, visibility, body, author_kind, metadata)
  values (
    v_request.company_id, v_request.id, 'dispatch', 'customer',
    v_vendor.name || ' marked the work finished', 'vendor',
    jsonb_strip_nulls(jsonb_build_object(
      'action', 'finish', 'vendor_id', v_vendor.id, 'vendor_name', v_vendor.name,
      'dispatch_id', v_dispatch.id, 'note', v_note
    ))
  );

  select json_build_object(
    'action', 'finish', 'dispatch_id', v_dispatch.id, 'status', v_dispatch.status,
    'request_id', v_request.id, 'request_public_token', v_request.public_token,
    'vendor_id', v_vendor.id, 'vendor_name', v_vendor.name,
    'eta_at', v_dispatch.eta_at, 'vendor_note', v_note, 'decline_reason', null,
    'equipment_id', e.id, 'equipment_name', e.name, 'location_name', l.name,
    'company_id', c.id, 'company_name', c.name,
    'company_notification_email', case when is_service_role() then c.notification_email else null end
  )
  into v_result
  from equipment e
  join companies c on c.id = e.company_id
  left join locations l on l.id = e.location_id
  where e.id = v_request.equipment_id;

  return v_result;
end;
$$;

revoke execute on function vendor_finish_dispatch(text, text) from public;
grant execute on function vendor_finish_dispatch(text, text) to anon, authenticated, service_role;

comment on function vendor_finish_dispatch(text, text) is
  'Anon-callable. Rate-limited per dispatch (vd:, 60/h). Marks the dispatch finished; never changes service_requests.status.';

-- ----------------------------------------------------------------------------
-- 4f. vendor_decline_dispatch(p_token text, p_reason text)
-- ----------------------------------------------------------------------------

create or replace function vendor_decline_dispatch(p_token text, p_reason text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dispatch dispatches;
  v_request service_requests;
  v_vendor vendors;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_result json;
begin
  select * into v_dispatch from dispatches where token = p_token;
  if v_dispatch.id is null then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;

  select * into v_request from service_requests where id = v_dispatch.service_request_id;

  if v_dispatch.status = 'declined' or v_request.status in ('resolved', 'canceled') then
    raise exception 'This request is closed' using errcode = 'P0001';
  end if;

  if not check_rate_limit('vd:' || v_dispatch.id::text, 60, 3600) then
    raise exception 'Too many requests — try again later' using errcode = '54000';
  end if;

  -- Only from an active, not-yet-finished state.
  if v_dispatch.status not in ('sent', 'viewed', 'acknowledged', 'eta_given') then
    raise exception 'This request is closed' using errcode = 'P0001';
  end if;

  if length(v_reason) < 2 or length(v_reason) > 500 then
    raise exception 'Reason must be between 2 and 500 characters' using errcode = '22023';
  end if;

  select * into v_vendor from vendors where id = v_dispatch.vendor_id;

  update dispatches
  set status = 'declined', declined_at = now(), decline_reason = v_reason
  where id = v_dispatch.id
  returning * into v_dispatch;

  insert into request_activity (company_id, service_request_id, kind, visibility, body, author_kind, metadata)
  values (
    v_request.company_id, v_request.id, 'dispatch', 'customer',
    v_vendor.name || ' declined the work order', 'vendor',
    jsonb_build_object('action', 'decline', 'vendor_id', v_vendor.id, 'vendor_name', v_vendor.name,
      'dispatch_id', v_dispatch.id, 'decline_reason', v_reason)
  );

  select json_build_object(
    'action', 'decline', 'dispatch_id', v_dispatch.id, 'status', v_dispatch.status,
    'request_id', v_request.id, 'request_public_token', v_request.public_token,
    'vendor_id', v_vendor.id, 'vendor_name', v_vendor.name,
    'eta_at', v_dispatch.eta_at, 'vendor_note', null, 'decline_reason', v_reason,
    'equipment_id', e.id, 'equipment_name', e.name, 'location_name', l.name,
    'company_id', c.id, 'company_name', c.name,
    'company_notification_email', case when is_service_role() then c.notification_email else null end
  )
  into v_result
  from equipment e
  join companies c on c.id = e.company_id
  left join locations l on l.id = e.location_id
  where e.id = v_request.equipment_id;

  return v_result;
end;
$$;

revoke execute on function vendor_decline_dispatch(text, text) from public;
grant execute on function vendor_decline_dispatch(text, text) to anon, authenticated, service_role;

comment on function vendor_decline_dispatch(text, text) is
  'Anon-callable. Rate-limited per dispatch (vd:, 60/h). Only from sent/viewed/acknowledged/eta_given (else P0001); reason required, 2-500 chars.';

-- ----------------------------------------------------------------------------
-- 4g. vendor_attach_dispatch_invoice(p_token text, p_storage_path text) — service_role only
-- ----------------------------------------------------------------------------

create or replace function vendor_attach_dispatch_invoice(p_token text, p_storage_path text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dispatch dispatches;
  v_request service_requests;
  v_vendor vendors;
  v_result json;
begin
  select * into v_dispatch from dispatches where token = p_token;
  if v_dispatch.id is null then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;

  select * into v_request from service_requests where id = v_dispatch.service_request_id;

  if v_dispatch.status = 'declined' or v_request.status in ('resolved', 'canceled') then
    raise exception 'This request is closed' using errcode = 'P0001';
  end if;

  if not check_rate_limit('vd:' || v_dispatch.id::text, 60, 3600) then
    raise exception 'Too many requests — try again later' using errcode = '54000';
  end if;

  -- Re-validated server-side even though only the service role can call
  -- this: a compromised route must still not be able to write a row
  -- pointing at another tenant's object.
  if p_storage_path is null or p_storage_path not like
    (v_dispatch.company_id::text || '/dispatch-invoices/' || v_dispatch.id::text || '/%')
  then
    raise exception 'Invalid storage path' using errcode = '22023';
  end if;

  select * into v_vendor from vendors where id = v_dispatch.vendor_id;

  update dispatches
  set invoice_path = p_storage_path, invoice_uploaded_at = now()
  where id = v_dispatch.id
  returning * into v_dispatch;

  insert into request_activity (company_id, service_request_id, kind, visibility, body, author_kind, metadata)
  values (
    v_request.company_id, v_request.id, 'dispatch', 'customer',
    v_vendor.name || ' attached an invoice', 'vendor',
    jsonb_build_object('action', 'invoice', 'vendor_id', v_vendor.id, 'vendor_name', v_vendor.name,
      'dispatch_id', v_dispatch.id)
  );

  select json_build_object(
    'action', 'invoice', 'dispatch_id', v_dispatch.id, 'status', v_dispatch.status,
    'request_id', v_request.id, 'request_public_token', v_request.public_token,
    'vendor_id', v_vendor.id, 'vendor_name', v_vendor.name,
    'eta_at', v_dispatch.eta_at, 'vendor_note', null, 'decline_reason', null,
    'equipment_id', e.id, 'equipment_name', e.name, 'location_name', l.name,
    'company_id', c.id, 'company_name', c.name,
    'company_notification_email', c.notification_email
  )
  into v_result
  from equipment e
  join companies c on c.id = e.company_id
  left join locations l on l.id = e.location_id
  where e.id = v_request.equipment_id;

  return v_result;
end;
$$;

revoke execute on function vendor_attach_dispatch_invoice(text, text) from public, anon, authenticated;
grant execute on function vendor_attach_dispatch_invoice(text, text) to service_role;

comment on function vendor_attach_dispatch_invoice(text, text) is
  'Service-role only — called from /api/vendor-invoice after the file lands in storage. p_storage_path must match "<company_id>/dispatch-invoices/<dispatch_id>/%" exactly (22023 otherwise); the filename the vendor sent is never used.';

-- ============================================================================
-- 5. mark_dispatch_sent(p_dispatch_id uuid, p_ok boolean, p_error text default null)
-- ============================================================================

create or replace function mark_dispatch_sent(p_dispatch_id uuid, p_ok boolean, p_error text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_ok then
    update dispatches set sent_at = coalesce(sent_at, now()) where id = p_dispatch_id;
  else
    update dispatches set status = 'failed', last_error = left(coalesce(p_error, ''), 500) where id = p_dispatch_id;
  end if;
end;
$$;

revoke execute on function mark_dispatch_sent(uuid, boolean, text) from public, anon, authenticated;
grant execute on function mark_dispatch_sent(uuid, boolean, text) to service_role;

comment on function mark_dispatch_sent(uuid, boolean, text) is
  'Service-role only — called from /api/owner-requests right after the vendor email send attempt. Idempotent: sent_at is only ever set once (coalesce).';

-- ============================================================================
-- 6. claim_dispatch_sla_alerts(p_claim_stamp timestamptz, p_limit int default 50)
-- ============================================================================
--
-- One atomic claiming UPDATE ... RETURNING (the visit-reminders pattern, done
-- in SQL so overlapping cron runs cannot both claim a row). The cron releases
-- a failed send by setting sla_alerted_at = null WHERE sla_alerted_at =
-- <the stamp it passed in> — which is why the stamp is an argument, not now().

create or replace function claim_dispatch_sla_alerts(p_claim_stamp timestamptz, p_limit int default 50)
returns setof json
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with claimed as (
    update dispatches d
    set sla_alerted_at = p_claim_stamp
    where d.id in (
      select d2.id
      from dispatches d2
      join vendors v on v.id = d2.vendor_id
      join service_requests sr on sr.id = d2.service_request_id
      where d2.sla_alerted_at is null
        and d2.status in ('sent', 'viewed')
        and d2.sent_at is not null
        and d2.sent_at < now() - make_interval(mins => v.ack_sla_minutes)
        and sr.status not in ('resolved', 'canceled')
      order by d2.sent_at
      limit greatest(1, p_limit)
      for update of d2 skip locked
    )
    returning d.id, d.company_id, d.vendor_id, d.service_request_id, d.sent_at
  )
  select json_build_object(
    'dispatch_id', c.id,
    'company_id', c.company_id,
    'company_name', co.name,
    'company_notification_email', co.notification_email,
    'company_timezone', co.timezone,
    'vendor_name', v.name,
    'vendor_phone', v.phone,
    'ack_sla_minutes', v.ack_sla_minutes,
    'minutes_overdue', floor(extract(epoch from (now() - c.sent_at)) / 60)::int,
    'equipment_name', e.name,
    'location_name', l.name,
    'request_public_token', sr.public_token,
    'request_id', sr.id,
    'request_priority', sr.priority
  )
  from claimed c
  join companies co on co.id = c.company_id
  join vendors v on v.id = c.vendor_id
  join service_requests sr on sr.id = c.service_request_id
  join equipment e on e.id = sr.equipment_id
  left join locations l on l.id = e.location_id;
end;
$$;

revoke execute on function claim_dispatch_sla_alerts(timestamptz, int) from public, anon, authenticated;
grant execute on function claim_dispatch_sla_alerts(timestamptz, int) to service_role;

comment on function claim_dispatch_sla_alerts(timestamptz, int) is
  'Service-role only (hourly cron). Atomically claims overdue sent/viewed dispatches (FOR UPDATE SKIP LOCKED) so overlapping runs cannot double-alert; one alert per dispatch ever, unless a human clears sla_alerted_at.';
