-- 0026_owner_security_review.sql
--
-- Security-review follow-ups to 0024_owner_foundation.sql / 0025_owner_rpcs.sql.
-- Everything here closes a hole an attack was actually built for against the
-- local harness; each fix has a matching assertion in the
-- `-- security review` section of scripts/local-db/smoke-owner.sql.
--
--   1. equipment.location_id / vendor_id / warranty_vendor_id and
--      service_requests.location_id are plain FKs with no tenant constraint.
--      RLS on `equipment` only checks `company_id = get_my_company_id()`, so
--      any staff member could PATCH their own unit to point at ANOTHER
--      company's vendor or location straight through PostgREST (the dashboard
--      action's assertOwnedReferences() is not the only write path). That
--      turned into three separate cross-tenant leaks:
--        - resolve_qr_code() publishes the victim's location name,
--        - verify_site_pin() becomes an oracle for the victim's site PIN and
--          mints a site_pin_passes row owned by the victim's company,
--        - submit_owner_service_request() dispatches to the victim's vendor,
--          exposing that vendor's name/phone/account number and emailing them.
--      Two `before insert or update` triggers now reject the mismatch at the
--      database, which is the only layer every write path goes through.
--
--   2. submit_owner_service_request() inserted every `p_media` element
--      verbatim. The RPC is granted to `anon`, so the route's
--      isOwnedUploadPath() check in src/lib/public-request.ts was not a
--      boundary: a direct anon-key call could name ANY object in the
--      `service-request-media` bucket (0001's "Company staff can view their
--      own service request media" storage policy matches on
--      service_request_media.storage_path, so the row alone grants the read)
--      and could insert unbounded rows. The same rule the route already
--      applies now lives inside the definer function, for both the owner and
--      the provider submission path.
--
--   3. submit_service_request() accepted equipment_owner equipment, which
--      walked straight past the site-PIN gate that is the only access control
--      on the owner-kind report flow. It now raises P0003, the mirror image of
--      the guard submit_owner_service_request() already had for provider-kind
--      equipment.
--
--   4. create_company_and_profile(text,text,text,text) was created with plain
--      `create function`, and Supabase's default privileges grant EXECUTE on
--      every new public function to anon/authenticated. `revoke ... from
--      public` does not undo a role grant, so anon kept EXECUTE on it. The
--      body already refuses an anonymous caller, but §7's "grants minimal"
--      rule wants the grant gone too.
--
-- No enum values are added here, so this file runs fine inside a single
-- transaction (no `-- local-db: no-transaction` header needed).

-- ============================================================================
-- 1. Tenant-consistency triggers for the owner-roadmap foreign keys
-- ============================================================================

create or replace function enforce_equipment_tenant_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.location_id is not null and not exists (
    select 1 from locations l
    where l.id = new.location_id and l.company_id = new.company_id
  ) then
    raise exception 'CROSS_TENANT_REFERENCE: location does not belong to this company'
      using errcode = '42501';
  end if;

  if new.vendor_id is not null and not exists (
    select 1 from vendors v
    where v.id = new.vendor_id and v.company_id = new.company_id
  ) then
    raise exception 'CROSS_TENANT_REFERENCE: vendor does not belong to this company'
      using errcode = '42501';
  end if;

  if new.warranty_vendor_id is not null and not exists (
    select 1 from vendors v
    where v.id = new.warranty_vendor_id and v.company_id = new.company_id
  ) then
    raise exception 'CROSS_TENANT_REFERENCE: warranty vendor does not belong to this company'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- `update of <cols>` and not a blanket `update`: these three references can
-- only become cross-tenant when one of them (or company_id) changes, because
-- locations/vendors themselves can never be moved between companies (their
-- RLS update policies check company_id in both USING and WITH CHECK). A
-- provider-kind company leaves all three null, so it pays nothing.
create trigger equipment_enforce_tenant_refs
  before insert or update of company_id, location_id, vendor_id, warranty_vendor_id
  on equipment
  for each row execute function enforce_equipment_tenant_refs();

revoke execute on function enforce_equipment_tenant_refs() from public, anon, authenticated;

comment on function enforce_equipment_tenant_refs() is
  'Trigger only — not directly callable. Rejects an equipment row whose location_id/vendor_id/warranty_vendor_id belongs to another company (42501). The staff RLS policy on `equipment` only constrains company_id, so this is the only check every write path shares.';

create or replace function enforce_service_request_tenant_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.location_id is not null and not exists (
    select 1 from locations l
    where l.id = new.location_id and l.company_id = new.company_id
  ) then
    raise exception 'CROSS_TENANT_REFERENCE: location does not belong to this company'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger service_requests_enforce_tenant_refs
  before insert or update of company_id, location_id
  on service_requests
  for each row execute function enforce_service_request_tenant_refs();

revoke execute on function enforce_service_request_tenant_refs() from public, anon, authenticated;

comment on function enforce_service_request_tenant_refs() is
  'Trigger only — not directly callable. Same rule as enforce_equipment_tenant_refs(), for service_requests.location_id (0020 lets staff insert requests directly, and that policy only constrains company_id).';

-- ============================================================================
-- 2. Attachment-path validation shared by both public submission RPCs
-- ============================================================================
--
-- Mirrors isOwnedUploadPath() + MAX_MEDIA_ITEMS in src/lib/public-request.ts.
-- Comparison is by `left(...)`, never `like`: a token is caller-supplied and
-- LIKE would treat `%`/`_` in it as wildcards.

create or replace function assert_submission_media_ok(p_media jsonb, p_qr_token text)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_media jsonb := coalesce(p_media, '[]'::jsonb);
  v_item jsonb;
  v_path text;
  v_prefix text := p_qr_token || '/';
begin
  if jsonb_typeof(v_media) <> 'array' then
    raise exception 'Attachments must be a list' using errcode = '22023';
  end if;

  if jsonb_array_length(v_media) > 6 then
    raise exception 'Too many attachments (6 maximum)' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(v_media)
  loop
    v_path := v_item ->> 'storage_path';

    if v_path is null
       or length(v_path) > 400
       or position('..' in v_path) > 0
       or left(v_path, 1) = '/'
       or left(v_path, length(v_prefix)) <> v_prefix
       or length(v_path) <= length(v_prefix)
    then
      raise exception 'Attachment paths are invalid' using errcode = '22023';
    end if;
  end loop;
end;
$$;

revoke execute on function assert_submission_media_ok(jsonb, text) from public, anon, authenticated;
grant execute on function assert_submission_media_ok(jsonb, text) to service_role;

comment on function assert_submission_media_ok(jsonb, text) is
  'Helper for the two anon-callable submission RPCs (they run as their definer owner, so they can call it without a grant). Every attachment must sit under "<scanned token>/" — otherwise a direct anon-key RPC call could attach another tenant''s storage object to its own request and read it back through 0001''s service-request-media SELECT policy.';

-- ============================================================================
-- 3. submit_service_request(): reject owner-kind equipment + validate media
-- ============================================================================
--
-- 0018's body verbatim, plus the two guards above the insert. Same signature,
-- so `create or replace` keeps its grants; grants restated per 0018's rule.

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
  v_company_kind company_kind;
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

  -- An equipment_owner company's public report flow is
  -- submit_owner_service_request() and it is gated on a site PIN. Accepting
  -- that company's equipment here would walk straight past the gate, so this
  -- is the mirror of the P0003 that function already raises for provider-kind
  -- equipment.
  select c.kind into v_company_kind from companies c where c.id = v_equipment.company_id;
  if v_company_kind = 'equipment_owner' then
    raise exception 'This code belongs to an equipment owner' using errcode = 'P0003';
  end if;

  perform assert_submission_media_ok(p_media, p_qr_token);

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

  for v_item in select * from jsonb_array_elements(coalesce(p_media, '[]'::jsonb))
  loop
    insert into service_request_media (service_request_id, storage_path, media_type)
    values (v_request_id, v_item->>'storage_path', (v_item->>'media_type')::media_kind);
  end loop;

  insert into equipment_events (company_id, equipment_id, kind, summary, details, service_request_id, actor_kind)
  values (
    v_equipment.company_id, v_equipment.id, 'request_submitted',
    'Service request submitted by ' || p_contact_name,
    jsonb_build_object('priority', v_priority, 'media_count', jsonb_array_length(coalesce(p_media, '[]'::jsonb))),
    v_request_id, 'customer'
  );

  insert into request_activity (company_id, service_request_id, kind, visibility, body, author_kind)
  values (v_equipment.company_id, v_request_id, 'status_change', 'customer', 'Request received', 'system');

  select json_build_object(
    'request_id', v_request_id,
    'public_token', v_public_token,
    'company_id', c.id,
    'company_name', c.name,
    -- Internal inbox: service role only (see 0018's header).
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

revoke execute on function submit_service_request(text, text, text, text, text, jsonb, jsonb, text) from public;
grant execute on function submit_service_request(text, text, text, text, text, jsonb, jsonb, text) to anon, authenticated, service_role;

comment on function submit_service_request(text, text, text, text, text, jsonb, jsonb, text) is
  'Anon-callable provider-kind submission. Rejects equipment_owner equipment (P0003 — that flow is submit_owner_service_request and is PIN-gated) and every attachment path that does not sit under the scanned token''s own prefix (22023).';

-- ============================================================================
-- 4. submit_owner_service_request(): validate media before anything is written
-- ============================================================================
--
-- 0025's body verbatim, plus the assert_submission_media_ok() call, placed
-- with the other argument validation so a bad payload never reaches an insert.

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
  v_media jsonb := coalesce(p_media, '[]'::jsonb);
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

  -- Before the PIN gate and before any write: this RPC is granted to anon, so
  -- the route's own isOwnedUploadPath() check is not the boundary.
  perform assert_submission_media_ok(v_media, p_qr_token);

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

  for v_item in select * from jsonb_array_elements(v_media)
  loop
    insert into service_request_media (service_request_id, storage_path, media_type)
    values (v_request_id, v_item->>'storage_path', (v_item->>'media_type')::media_kind);
  end loop;

  insert into equipment_events (company_id, equipment_id, kind, summary, details, service_request_id, actor_kind)
  values (
    v_equipment.company_id, v_equipment.id, 'request_submitted',
    'Service request submitted by ' || v_contact_name,
    jsonb_build_object('priority', v_priority, 'media_count', jsonb_array_length(v_media), 'symptom_count', v_symptom_count),
    v_request_id, 'customer'
  );

  insert into request_activity (company_id, service_request_id, kind, visibility, body, author_kind)
  values (v_equipment.company_id, v_request_id, 'status_change', 'customer', 'Request received', 'system');

  -- Vendor resolution: warranty > unit > category default > none. Any
  -- resolved vendor with active = false falls through to the next tier
  -- rather than stopping resolution outright. Every candidate is re-checked
  -- against the unit's own company_id — belt and braces next to the
  -- enforce_equipment_tenant_refs() trigger above, because this is the call
  -- that emails a vendor.
  if v_equipment.warranty_vendor_id is not null
     and v_equipment.warranty_ends_on is not null
     and v_equipment.warranty_ends_on >= current_date then
    select * into v_candidate from vendors
    where id = v_equipment.warranty_vendor_id and active and company_id = v_equipment.company_id;
    if v_candidate.id is not null then
      v_vendor := v_candidate;
      v_vendor_source := 'warranty';
    end if;
  end if;

  if v_vendor.id is null and v_equipment.vendor_id is not null then
    select * into v_candidate from vendors
    where id = v_equipment.vendor_id and active and company_id = v_equipment.company_id;
    if v_candidate.id is not null then
      v_vendor := v_candidate;
      v_vendor_source := 'unit';
    end if;
  end if;

  if v_vendor.id is null then
    select v.* into v_candidate
    from category_default_vendors cdv
    join vendors v on v.id = cdv.vendor_id and v.active and v.company_id = cdv.company_id
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
  'Anon-callable owner-kind report submission. Rate-limited per QR code (osr:rpc:, 30/h). Attachments must sit under the scanned token''s own prefix, max 6 (22023). dispatch_id/dispatch_token/vendor_email/company_notification_email are is_service_role()-gated.';

-- ============================================================================
-- 5. Grant hygiene: anon never needed create_company_and_profile()
-- ============================================================================
--
-- `create function` picks up Supabase's default privileges (EXECUTE to anon,
-- authenticated, service_role on everything new in `public`), and 0024's
-- `revoke ... from public` does not remove a role grant. The 4-arg overload
-- therefore shipped anon-callable. Its body already raises 'Must be
-- authenticated' when auth.uid() is null, so nothing was reachable — but the
-- grant itself is what §7.9 asks to be minimal.

revoke execute on function create_company_and_profile(text, text, text, text) from anon;
revoke execute on function create_company_and_profile(text, text, text) from anon;
