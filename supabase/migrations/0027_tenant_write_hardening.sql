-- 0027_tenant_write_hardening.sql
--
-- Database-audit follow-ups. Every item was reproduced against the local
-- harness (scripts/local-db) before being fixed; the matching assertions are
-- the `-- security review (0027)` block in smoke-owner.sql.
--
--   1. profiles: the UPDATE policy (0001, re-created in 0012) is just
--      `id = auth.uid()` and the table grant covers every column, so any
--      technician can `update profiles set role='owner', company_id='<other>'`
--      through PostgREST and become an owner of another tenant (all RLS keys
--      off profiles.company_id). The INSERT policy has the same shape and
--      profiles.role DEFAULTS to 'owner', so a freshly signed-up user with no
--      profile can insert itself straight into any company. The app only ever
--      updates full_name directly (src/app/dashboard/settings/account/actions.ts:24);
--      profile creation goes through create_company_and_profile() /
--      accept_invitation(), both SECURITY DEFINER. Fixed with column-level
--      grants — the same technique 0022 §2e used for webhook_endpoints.secret.
--   2. companies: "Owners can update own company" plus the blanket table grant
--      let an owner PATCH trial_ends_at (=> 'pro'/'site' entitlements forever),
--      kind, slug, created_at and trial_reminder_sent_at. Only the columns the
--      dashboard actually writes with the user client stay updatable.
--      stripe_customer_id is deliberately NOT in the list: an owner could
--      otherwise PATCH another company's cus_ id onto its own row and have the
--      Stripe webhook mis-route that customer's subscription events; the one
--      place the app writes it (settings/billing/actions.ts) uses the
--      service-role client instead.
--   3. Tenant-consistency triggers (0026 §1 pattern) for the remaining FKs a
--      staff INSERT/UPDATE can point at another company's row:
--        - qr_codes.equipment_id — equipment.id is public (resolve_qr_code), so
--          repointing an own code at another tenant's unit made the sticker
--          publish that tenant's branding, unit and open requests, and
--          submit_service_request() then filed requests INTO that tenant.
--        - service_requests.equipment_id / customer_id / assigned_to /
--          maintenance_schedule_id / inspection_id — an own request pointed at
--          another tenant's unit appeared in that tenant's public open_requests,
--          stamped THEIR equipment.last_serviced_at and wrote an equipment_events
--          row on their unit when resolved (security-definer trigger);
--          assigned_to published another tenant's staff name and routes
--          customer-update emails to them.
--        - equipment.equipment_type_id / customer_id — another tenant's guide was
--          published on this tenant's sticker, and that tenant could no longer
--          delete its equipment type (ON DELETE RESTRICT).
--   4. submit_service_request(): the provider-kind submission RPC had no
--      in-function rate limit, unlike submit_owner_service_request(),
--      add_customer_request_update() and verify_site_pin(). A direct anon-key
--      call bypasses the API route's limiter entirely. Same 30/h-per-code
--      backstop as the owner path.
--   5. get_equipment_guide(text): 0001's public reader, superseded by
--      resolve_qr_code() (0004) and BROKEN since 0005 dropped
--      guide_steps.step_number (every call raises 42703). Still granted to anon;
--      nothing in src/ calls it. Dropped (0010 precedent).
--
-- No enum changes, so this runs inside a single transaction.

-- ============================================================================
-- 1. profiles: users may only edit their own full_name; never role/company_id;
--    never insert directly
-- ============================================================================
revoke insert, update on public.profiles from anon, authenticated;
grant update (full_name) on public.profiles to authenticated;

comment on table public.profiles is
  'Rows are created only by create_company_and_profile() / accept_invitation() and changed by update_member_role() / remove_member(); the only column a user may update directly is full_name (column-level grant, 0027).';

-- ============================================================================
-- 2. companies: owners may update settings/branding/onboarding columns only
-- ============================================================================
revoke update on public.companies from anon, authenticated;
grant update (
  name, notification_email, phone, sms_number, website, timezone, customer_updates_enabled,
  logo_path, brand_color,
  onboarding_dismissed_at, owner_setup_completed_at, welcome_email_sent_at
) on public.companies to authenticated;

comment on column public.companies.stripe_customer_id is
  'Never updatable through PostgREST (0027 column grants): written only by the service-role client / the Stripe webhook.';

comment on column public.companies.trial_ends_at is
  'Never updatable through PostgREST (0027 column grants): only migrations/the service role move the trial clock.';

-- ============================================================================
-- 3a. equipment: equipment_type_id and customer_id must belong to company_id
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

  -- 0027: equipment_types.id is public (resolve_qr_code), customers is not,
  -- but neither FK was tenant-constrained.
  if new.equipment_type_id is not null and not exists (
    select 1 from equipment_types et
    where et.id = new.equipment_type_id and et.company_id = new.company_id
  ) then
    raise exception 'CROSS_TENANT_REFERENCE: equipment type does not belong to this company'
      using errcode = '42501';
  end if;

  if new.customer_id is not null and not exists (
    select 1 from customers cu
    where cu.id = new.customer_id and cu.company_id = new.company_id
  ) then
    raise exception 'CROSS_TENANT_REFERENCE: customer does not belong to this company'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists equipment_enforce_tenant_refs on equipment;
create trigger equipment_enforce_tenant_refs
  before insert or update of company_id, location_id, vendor_id, warranty_vendor_id, equipment_type_id, customer_id
  on equipment
  for each row execute function enforce_equipment_tenant_refs();

revoke execute on function enforce_equipment_tenant_refs() from public, anon, authenticated;

-- ============================================================================
-- 3b. service_requests: equipment_id, customer_id, assigned_to,
--     maintenance_schedule_id, inspection_id must belong to company_id
-- ============================================================================
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

  -- 0027: the 0001 UPDATE policy and the 0020 INSERT policy only constrain
  -- company_id (0020 also checks equipment_id, but only on INSERT).
  if not exists (
    select 1 from equipment e
    where e.id = new.equipment_id and e.company_id = new.company_id
  ) then
    raise exception 'CROSS_TENANT_REFERENCE: equipment does not belong to this company'
      using errcode = '42501';
  end if;

  if new.customer_id is not null and not exists (
    select 1 from customers cu
    where cu.id = new.customer_id and cu.company_id = new.company_id
  ) then
    raise exception 'CROSS_TENANT_REFERENCE: customer does not belong to this company'
      using errcode = '42501';
  end if;

  if new.assigned_to is not null and not exists (
    select 1 from profiles p
    where p.id = new.assigned_to and p.company_id = new.company_id
  ) then
    raise exception 'CROSS_TENANT_REFERENCE: assignee does not belong to this company'
      using errcode = '42501';
  end if;

  if new.maintenance_schedule_id is not null and not exists (
    select 1 from maintenance_schedules ms
    where ms.id = new.maintenance_schedule_id and ms.company_id = new.company_id
  ) then
    raise exception 'CROSS_TENANT_REFERENCE: maintenance schedule does not belong to this company'
      using errcode = '42501';
  end if;

  if new.inspection_id is not null and not exists (
    select 1 from inspections i
    where i.id = new.inspection_id and i.company_id = new.company_id
  ) then
    raise exception 'CROSS_TENANT_REFERENCE: inspection does not belong to this company'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists service_requests_enforce_tenant_refs on service_requests;
create trigger service_requests_enforce_tenant_refs
  before insert or update of company_id, location_id, equipment_id, customer_id, assigned_to,
                            maintenance_schedule_id, inspection_id
  on service_requests
  for each row execute function enforce_service_request_tenant_refs();

revoke execute on function enforce_service_request_tenant_refs() from public, anon, authenticated;

-- ============================================================================
-- 3c. qr_codes: equipment_id must belong to company_id
-- ============================================================================
create or replace function enforce_qr_code_tenant_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.equipment_id is not null and not exists (
    select 1 from equipment e
    where e.id = new.equipment_id and e.company_id = new.company_id
  ) then
    raise exception 'CROSS_TENANT_REFERENCE: equipment does not belong to this company'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists qr_codes_enforce_tenant_refs on qr_codes;
create trigger qr_codes_enforce_tenant_refs
  before insert or update of company_id, equipment_id
  on qr_codes
  for each row execute function enforce_qr_code_tenant_refs();

revoke execute on function enforce_qr_code_tenant_refs() from public, anon, authenticated;

comment on function enforce_qr_code_tenant_refs() is
  'Trigger only — not directly callable. The 0004 insert / 0013 update policies on qr_codes only constrain company_id; equipment.id is public via resolve_qr_code(), so a code pointed at another tenant''s unit would publish that tenant and let submit_service_request() file requests into it (42501).';

-- ============================================================================
-- 4. submit_service_request(): per-code rate-limit backstop inside the RPC
--    (0026 body verbatim + one check, placed with the other validation)
-- ============================================================================
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

  select c.kind into v_company_kind from companies c where c.id = v_equipment.company_id;
  if v_company_kind = 'equipment_owner' then
    raise exception 'This code belongs to an equipment owner' using errcode = 'P0003';
  end if;

  perform assert_submission_media_ok(p_media, p_qr_token);

  -- 0027: backstop against a direct anon-key call bypassing the API route's
  -- own per-IP/per-token limits — the same rule submit_owner_service_request()
  -- already applies (runs as the definer owner; check_rate_limit stays
  -- service-role only).
  if not check_rate_limit('sr:rpc:' || v_code.id::text, 30, 3600) then
    raise exception 'Too many requests — try again later' using errcode = '54000';
  end if;

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
  'Anon-callable provider-kind submission. Rejects equipment_owner equipment (P0003), attachment paths outside the scanned token''s prefix (22023), and more than 30 submissions per code per hour (54000, 0027).';

-- ============================================================================
-- 5. Drop the dead, broken, anon-callable 0001 reader
-- ============================================================================
drop function if exists public.get_equipment_guide(text);
