\set ON_ERROR_STOP on
-- Smoke test for migrations 0024/0025 (owner roadmap foundation + RPCs).
-- Same shape as smoke-next.sql: fixed UUID seed data, role/claim switches,
-- `do $$ ... raise exception ... $$` assertions, final OK marker.
-- Run against a FRESH `db.sh reset` — this file seeds fixed ids and must not
-- share a database with another smoke file:
--   psql "$(scripts/local-db/db.sh url)" -f scripts/local-db/smoke-owner.sql

-- ============================================================================
-- Seed: provider company P (kind default) + its own equipment/code
-- ============================================================================
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000002', 'p-owner@x.test');
insert into companies (id, name, slug, notification_email) values
  ('a0000000-0000-0000-0000-000000000001', 'Acme Service Co', 'acme-service', 'p-notify@x.test');
insert into profiles (id, company_id, full_name, role) values
  ('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'P Owner', 'owner');
insert into equipment_types (id, company_id, name) values
  ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'HVAC');
insert into equipment (id, company_id, equipment_type_id, name) values
  ('a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000003', 'Rooftop Unit 1');
insert into qr_codes (token, company_id, equipment_id, source, claimed_at) values
  ('ptoken0000000000000001', 'a0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000004', 'instant', now());

-- ============================================================================
-- Seed: owner company O (kind='equipment_owner') + location/vendor/equipment
-- ============================================================================
insert into auth.users (id, email) values
  ('b0000000-0000-0000-0000-000000000002', 'o-owner@x.test'),
  ('b0000000-0000-0000-0000-000000000003', 'o-tech@x.test');
insert into companies (id, name, slug, notification_email, kind) values
  ('b0000000-0000-0000-0000-000000000001', 'Bob''s Diner', 'bobs-diner', 'o-notify@x.test', 'equipment_owner');
insert into profiles (id, company_id, full_name, role) values
  ('b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'O Owner', 'owner'),
  ('b0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'O Tech', 'technician');
insert into locations (id, company_id, name, site_pin) values
  ('b0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001', 'Main Street', '4821');
insert into vendors (id, company_id, name, email, phone, ack_sla_minutes) values
  ('b0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000001',
   'Metro Refrigeration', 'vendor@metro-refrig.test', '555-0100', 120);
insert into equipment_types (id, company_id, name, symptom_chips) values
  ('b0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000001', 'Reach-in cooler',
   array['Not cooling', 'Freezing product', 'Door won''t seal']);
insert into equipment (id, company_id, equipment_type_id, location_id, vendor_id, name) values
  ('b0000000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000004',
   'b0000000-0000-0000-0000-000000000005', 'Reach-in #1');
insert into qr_codes (token, company_id, equipment_id, source, claimed_at) values
  ('otoken0000000000000001', 'b0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000007', 'instant', now());
-- Second real unit at the same location/vendor — used for the cross-dispatch
-- token isolation check (assertion 19).
insert into equipment (id, company_id, equipment_type_id, location_id, vendor_id, name) values
  ('b0000000-0000-0000-0000-000000000008', 'b0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000004',
   'b0000000-0000-0000-0000-000000000005', 'Reach-in #2');
insert into qr_codes (token, company_id, equipment_id, source, claimed_at) values
  ('otoken0000000000000002', 'b0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000008', 'instant', now());
-- A third unit at the SAME location L (not a second location — O is on the
-- trial "site" plan, max_locations=1) with its own qr code, used only for
-- the PIN brute-force test so its pin:tok: bucket starts fresh.
insert into equipment (id, company_id, equipment_type_id, location_id, name) values
  ('b0000000-0000-0000-0000-000000000009', 'b0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000004', 'Brute Force Unit');
insert into qr_codes (token, company_id, equipment_id, source, claimed_at) values
  ('otoken-bruteforce-0001', 'b0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000009', 'instant', now());

-- ============================================================================
-- As anon
-- ============================================================================
set role anon;

-- 1. resolve_qr_code(O): kind, site_pin_required, symptom_chips, location.
do $$
declare v json;
begin
  v := resolve_qr_code('otoken0000000000000001');
  if v->'guide'->'company'->>'kind' <> 'equipment_owner' then
    raise exception 'expected company.kind=equipment_owner, got %', v->'guide'->'company'->>'kind';
  end if;
  if (v->'guide'->>'site_pin_required')::boolean is not true then
    raise exception 'expected site_pin_required=true';
  end if;
  if json_array_length(v->'guide'->'equipment_type'->'symptom_chips') = 0 then
    raise exception 'expected symptom_chips to be non-empty';
  end if;
  if v->'guide'->'location'->>'name' is null then
    raise exception 'expected location.name to be present';
  end if;
end $$;

-- 2. No site_pin KEY (site_pin_required legitimately contains the substring
-- "site_pin", so match the exact key form) and no vendor key or PIN value.
do $$
declare
  v json := resolve_qr_code('otoken0000000000000001');
  t text := v::text;
begin
  if t like '%"site_pin":%' then raise exception 'LEAK: site_pin key present in resolve_qr_code payload'; end if;
  if t like '%"vendor":%' then raise exception 'LEAK: vendor key present in resolve_qr_code payload'; end if;
  if t like '%4821%' then raise exception 'LEAK: PIN value present in resolve_qr_code payload'; end if;
end $$;

-- 3. resolve_qr_code(P) unchanged.
do $$
declare v json;
begin
  v := resolve_qr_code('ptoken0000000000000001');
  if v->'guide'->'company'->>'kind' <> 'service_provider' then
    raise exception 'expected P company.kind=service_provider';
  end if;
  if (v->'guide'->>'site_pin_required')::boolean is not false then
    raise exception 'expected site_pin_required=false for a provider-kind company';
  end if;
  if not ((v->'guide')::jsonb ? 'open_requests') then raise exception 'open_requests missing for P'; end if;
  if not ((v->'guide')::jsonb ? 'root_step_id') then raise exception 'root_step_id missing for P'; end if;
  if not ((v->'guide'->'equipment')::jsonb ? 'next_service_due_on') then raise exception 'next_service_due_on missing for P'; end if;
end $$;

-- 4. submit_owner_service_request with no pass -> P0004.
do $$
begin
  begin
    perform submit_owner_service_request('otoken0000000000000001', 'Not cooling well', 'Alice Server');
    raise exception 'expected P0004 (site code required)';
  exception when sqlstate 'P0004' then null;
  end;
end $$;

-- 5. verify_site_pin(O, '0000') -> ok=false, pass null.
do $$
declare v json;
begin
  v := verify_site_pin('otoken0000000000000001', '0000');
  if (v->>'ok')::boolean is not false then raise exception 'expected ok=false for a wrong PIN'; end if;
  if v->>'pass' is not null then raise exception 'expected pass=null for a wrong PIN'; end if;
end $$;

-- 6. verify_site_pin(O, '4821') -> ok=true, 48-char opaque pass, != the PIN.
select verify_site_pin('otoken0000000000000001', '4821') as vp \gset
select set_config('smoke.vp', :'vp', false);
do $$
declare v json := current_setting('smoke.vp')::json;
begin
  if (v->>'ok')::boolean is not true then raise exception 'expected ok=true for the correct PIN'; end if;
  if length(v->>'pass') <> 48 then raise exception 'expected a 48-char pass, got % chars', length(v->>'pass'); end if;
  if v->>'pass' = '4821' then raise exception 'pass must never equal the PIN'; end if;
end $$;
select (current_setting('smoke.vp')::json)->>'pass' as pin_pass \gset
select set_config('smoke.pin_pass', :'pin_pass', false);

-- 7. Submit with that pass -> succeeds; vendor visible to anon; every
-- service-role-only field is null.
select submit_owner_service_request(
  'otoken0000000000000001', 'Not cooling well', 'Alice Server', '555-0199',
  array['Not cooling'], 'high', '[]'::jsonb, current_setting('smoke.pin_pass')
) as osr \gset
select set_config('smoke.osr', :'osr', false);
do $$
declare v json := current_setting('smoke.osr')::json;
begin
  if v->'vendor'->>'name' is null then raise exception 'expected vendor.name present for anon'; end if;
  if v->'vendor'->>'phone' is null then raise exception 'expected vendor.phone present for anon'; end if;
  if v->>'company_notification_email' is not null then raise exception 'LEAK: anon got company_notification_email'; end if;
  if v->>'vendor_email' is not null then raise exception 'LEAK: anon got vendor_email'; end if;
  if v->>'dispatch_id' is not null then raise exception 'LEAK: anon got dispatch_id'; end if;
  if v->>'dispatch_token' is not null then raise exception 'LEAK: anon got dispatch_token'; end if;
end $$;
select set_config('smoke.osr_request_id', (current_setting('smoke.osr')::json)->>'request_id', false);

-- 8. submit_owner_service_request against P's token -> P0003.
do $$
begin
  begin
    perform submit_owner_service_request('ptoken0000000000000001', 'Wrong path test', 'Test Name');
    raise exception 'expected P0003 for a provider-kind token';
  exception when sqlstate 'P0003' then null;
  end;
end $$;

-- 9. priority 'urgent' is coerced to 'normal' (checked below as service role
-- — RLS hides service_requests from anon).
select submit_owner_service_request(
  'otoken0000000000000001', 'Ice buildup on the coils', 'Bob Cook', null,
  array['Freezing product'], 'urgent', '[]'::jsonb, current_setting('smoke.pin_pass')
) as osr2 \gset
select set_config('smoke.osr2_request_id', (:'osr2'::json)->>'request_id', false);

-- 10. Direct table reads return nothing.
do $$
declare n int;
begin
  select count(*) into n from vendors; if n <> 0 then raise exception 'LEAK: anon can read vendors (%)', n; end if;
  select count(*) into n from locations; if n <> 0 then raise exception 'LEAK: anon can read locations (%)', n; end if;
  select count(*) into n from dispatches; if n <> 0 then raise exception 'LEAK: anon can read dispatches (%)', n; end if;
  select count(*) into n from site_pin_passes; if n <> 0 then raise exception 'LEAK: anon can read site_pin_passes (%)', n; end if;
  select count(*) into n from category_default_vendors;
  if n <> 0 then raise exception 'LEAK: anon can read category_default_vendors (%)', n; end if;
end $$;

-- 11. 16 consecutive wrong PINs on a fresh token -> the 16th raises 54000
-- (pin:tok: is 15/h; a dedicated qr code keeps this bucket pristine).
do $$
declare i int; failed_at_16 boolean := false;
begin
  for i in 1..16 loop
    begin
      perform verify_site_pin('otoken-bruteforce-0001', '0000');
      if i = 16 then raise exception 'expected the 16th wrong-PIN attempt to raise 54000, but it succeeded'; end if;
    exception
      when sqlstate '54000' then
        if i <> 16 then raise exception '54000 raised too early, on attempt %', i; end if;
        failed_at_16 := true;
    end;
  end loop;
  if not failed_at_16 then raise exception 'expected the 16th attempt to raise 54000'; end if;
end $$;

-- ============================================================================
-- As service role
-- ============================================================================
reset role;
set role service_role;
set request.jwt.claim.role = 'service_role';

-- (9, continued) confirm the stored row coerced 'urgent' -> 'normal'.
do $$
declare v_priority text;
begin
  select priority into v_priority from service_requests where id = current_setting('smoke.osr2_request_id')::uuid;
  if v_priority <> 'normal' then raise exception 'expected urgent to be coerced to normal, got %', v_priority; end if;
end $$;

-- 12. Submit as service role -> every gated field non-null.
select submit_owner_service_request(
  'otoken0000000000000001', 'Compressor humming loudly', 'Carol Manager', '555-0155',
  array['Loud noise'], 'normal', '[]'::jsonb, current_setting('smoke.pin_pass')
) as osr3 \gset
select set_config('smoke.osr3', :'osr3', false);
do $$
declare v json := current_setting('smoke.osr3')::json;
begin
  if v->>'company_notification_email' is null then raise exception 'expected company_notification_email for service role'; end if;
  if v->>'vendor_email' is null then raise exception 'expected vendor_email for service role'; end if;
  if v->>'dispatch_id' is null then raise exception 'expected dispatch_id for service role'; end if;
  if v->>'dispatch_token' is null then raise exception 'expected dispatch_token for service role'; end if;
end $$;
select set_config('smoke.d1_id', (current_setting('smoke.osr3')::json)->>'dispatch_id', false);
select set_config('smoke.d1_token', (current_setting('smoke.osr3')::json)->>'dispatch_token', false);
select set_config('smoke.d1_request_id', (current_setting('smoke.osr3')::json)->>'request_id', false);

-- 13. One dispatches row, status='sent', sent_at null; trigger-synced
-- service_requests.dispatch_status/dispatch_id.
do $$
declare
  v_count int;
  v_status dispatch_status;
  v_sent_at timestamptz;
  v_req_status dispatch_status;
  v_req_dispatch_id uuid;
begin
  select count(*) into v_count from dispatches where service_request_id = current_setting('smoke.d1_request_id')::uuid;
  if v_count <> 1 then raise exception 'expected exactly 1 dispatch row, got %', v_count; end if;

  select status, sent_at into v_status, v_sent_at from dispatches where id = current_setting('smoke.d1_id')::uuid;
  if v_status <> 'sent' then raise exception 'expected status=sent, got %', v_status; end if;
  if v_sent_at is not null then raise exception 'expected sent_at to be null before mark_dispatch_sent'; end if;

  select dispatch_status, dispatch_id into v_req_status, v_req_dispatch_id
  from service_requests where id = current_setting('smoke.d1_request_id')::uuid;
  if v_req_status <> 'sent' then raise exception 'expected service_requests.dispatch_status=sent, got %', v_req_status; end if;
  if v_req_dispatch_id <> current_setting('smoke.d1_id')::uuid then raise exception 'expected dispatch_id to be trigger-synced'; end if;
end $$;

-- 14. mark_dispatch_sent(id, true) stamps sent_at; calling it twice is a no-op.
do $$
declare v1 timestamptz; v2 timestamptz;
begin
  perform mark_dispatch_sent(current_setting('smoke.d1_id')::uuid, true, null);
  select sent_at into v1 from dispatches where id = current_setting('smoke.d1_id')::uuid;
  if v1 is null then raise exception 'expected sent_at to be stamped'; end if;

  perform mark_dispatch_sent(current_setting('smoke.d1_id')::uuid, true, null);
  select sent_at into v2 from dispatches where id = current_setting('smoke.d1_id')::uuid;
  if v1 <> v2 then raise exception 'expected sent_at unchanged on a second call: % vs %', v1, v2; end if;
end $$;

-- 15. claim_dispatch_sla_alerts: one claimed row after backdating sent_at;
-- a second claim with the same stamp returns nothing.
do $$
declare v_stamp timestamptz := now(); n int;
begin
  update dispatches set sent_at = now() - interval '4 hours' where id = current_setting('smoke.d1_id')::uuid;

  select count(*) into n from claim_dispatch_sla_alerts(v_stamp, 50);
  if n <> 1 then raise exception 'expected 1 claimed row, got %', n; end if;

  select count(*) into n from claim_dispatch_sla_alerts(v_stamp, 50);
  if n <> 0 then raise exception 'expected 0 rows on a second claim, got %', n; end if;

  perform 1 from dispatches where id = current_setting('smoke.d1_id')::uuid and sla_alerted_at = v_stamp;
  if not found then raise exception 'expected sla_alerted_at to equal the claim stamp'; end if;
end $$;

-- 16. vendor_attach_dispatch_invoice: wrong prefix -> 22023; right prefix -> ok.
do $$
begin
  begin
    perform vendor_attach_dispatch_invoice(current_setting('smoke.d1_token'), 'wrong/path/invoice.pdf');
    raise exception 'expected 22023 for a storage path outside the dispatch prefix';
  exception when sqlstate '22023' then null;
  end;
end $$;
do $$
declare v_company_id uuid; v_path text;
begin
  select company_id into v_company_id from dispatches where id = current_setting('smoke.d1_id')::uuid;
  v_path := v_company_id::text || '/dispatch-invoices/' || current_setting('smoke.d1_id') || '/invoice.pdf';
  perform vendor_attach_dispatch_invoice(current_setting('smoke.d1_token'), v_path);
end $$;
do $$
declare v_path text;
begin
  select invoice_path into v_path from dispatches where id = current_setting('smoke.d1_id')::uuid;
  if v_path is null then raise exception 'expected invoice_path to be set'; end if;
end $$;

-- Set up D2 (second unit's dispatch) for the cross-token isolation check
-- (assertion 19), and one internal-only activity row on D1's request to
-- prove get_vendor_dispatch never surfaces it (assertion 17).
select submit_owner_service_request(
  'otoken0000000000000002', 'Second unit not cooling', 'Dana Cook', null,
  array['Not cooling'], 'normal', '[]'::jsonb, current_setting('smoke.pin_pass')
) as osr4 \gset
select set_config('smoke.d2_id', (:'osr4'::json)->>'dispatch_id', false);

insert into request_activity (company_id, service_request_id, kind, visibility, body, author_kind)
values ('b0000000-0000-0000-0000-000000000001', current_setting('smoke.d1_request_id')::uuid,
        'note', 'internal', 'SECRET INTERNAL NOTE', 'staff');

reset request.jwt.claim.role;
reset role;

-- ============================================================================
-- As anon, vendor token (D1)
-- ============================================================================
set role anon;

-- 17. get_vendor_dispatch: viewed, no site_pin/cost_cents/internal
-- activity/storage_path.
select get_vendor_dispatch(current_setting('smoke.d1_token')) as gvd \gset
select set_config('smoke.gvd', :'gvd', false);
do $$
declare v json := current_setting('smoke.gvd')::json; t text;
begin
  if v->'dispatch'->>'status' <> 'viewed' then raise exception 'expected status=viewed, got %', v->'dispatch'->>'status'; end if;
  t := v::text;
  if t like '%"site_pin":%' then raise exception 'LEAK: site_pin in vendor payload'; end if;
  if t like '%cost_cents%' then raise exception 'LEAK: cost_cents in vendor payload'; end if;
  if t like '%storage_path%' then raise exception 'LEAK: storage_path in vendor payload'; end if;
  if t like '%SECRET INTERNAL NOTE%' then raise exception 'LEAK: internal activity row in vendor payload'; end if;
end $$;

-- 18. Unknown token -> P0002.
do $$
begin
  begin
    perform get_vendor_dispatch('deadbeefdeadbeefdeadbeefdeadbeef');
    raise exception 'expected P0002 for an unknown dispatch token';
  exception when sqlstate 'P0002' then null;
  end;
end $$;

-- 20. Acknowledge -> in_progress, exactly one NEW vendor-authored,
-- customer-visible activity row (the invoice-attach step in 16 already
-- added one, so this asserts the delta, not an absolute count).
reset role;
set role service_role;
set request.jwt.claim.role = 'service_role';
select set_config('smoke.vact_before', (
  select count(*)::text from request_activity
  where service_request_id = current_setting('smoke.d1_request_id')::uuid
    and kind = 'dispatch' and author_kind = 'vendor' and visibility = 'customer'
), false);
reset request.jwt.claim.role;
reset role;
set role anon;

select vendor_acknowledge_dispatch(current_setting('smoke.d1_token'), 'On our way') as vack \gset

reset role;
set role service_role;
set request.jwt.claim.role = 'service_role';
do $$
declare v_dispatch_status dispatch_status; v_req_status request_status; n int;
begin
  select status into v_dispatch_status from dispatches where id = current_setting('smoke.d1_id')::uuid;
  if v_dispatch_status <> 'acknowledged' then raise exception 'expected acknowledged, got %', v_dispatch_status; end if;

  select status into v_req_status from service_requests where id = current_setting('smoke.d1_request_id')::uuid;
  if v_req_status <> 'in_progress' then raise exception 'expected request to move to in_progress, got %', v_req_status; end if;

  select count(*) into n from request_activity
  where service_request_id = current_setting('smoke.d1_request_id')::uuid
    and kind = 'dispatch' and author_kind = 'vendor' and visibility = 'customer';
  if n - current_setting('smoke.vact_before')::int <> 1 then
    raise exception 'expected exactly 1 NEW vendor dispatch activity row, got %', n - current_setting('smoke.vact_before')::int;
  end if;
end $$;
reset request.jwt.claim.role;
reset role;
set role anon;

-- 21. ETA: past rejected (22023); valid accepted -> eta_given.
do $$
begin
  begin
    perform vendor_set_dispatch_eta(current_setting('smoke.d1_token'), now() - interval '1 hour', null);
    raise exception 'expected 22023 for a past ETA';
  exception when sqlstate '22023' then null;
  end;
end $$;
select vendor_set_dispatch_eta(current_setting('smoke.d1_token'), now() + interval '3 hours', 'On the way') as veta \gset
select set_config('smoke.veta', :'veta', false);
do $$
declare v json := current_setting('smoke.veta')::json;
begin
  if v->>'status' <> 'eta_given' then raise exception 'expected eta_given, got %', v->>'status'; end if;
end $$;

-- Also exercise vendor_add_dispatch_note (listed in §2.2.4, no separate
-- assertion number) — status must stay unchanged.
select vendor_add_dispatch_note(current_setting('smoke.d1_token'), 'Bringing a replacement compressor') as vnote \gset
select set_config('smoke.vnote', :'vnote', false);
do $$
declare v json := current_setting('smoke.vnote')::json;
begin
  if v->>'status' <> 'eta_given' then raise exception 'expected status unchanged by vendor_add_dispatch_note, got %', v->>'status'; end if;
end $$;

-- 22. Finish -> does not touch service_requests.status.
select vendor_finish_dispatch(current_setting('smoke.d1_token'), 'All done') as vfin \gset

reset role;
set role service_role;
set request.jwt.claim.role = 'service_role';
do $$
declare v_dispatch_status dispatch_status; v_req_status request_status;
begin
  select status into v_dispatch_status from dispatches where id = current_setting('smoke.d1_id')::uuid;
  if v_dispatch_status <> 'finished' then raise exception 'expected finished, got %', v_dispatch_status; end if;

  select status into v_req_status from service_requests where id = current_setting('smoke.d1_request_id')::uuid;
  if v_req_status in ('resolved', 'canceled') then raise exception 'finish must not close the request, got %', v_req_status; end if;
end $$;
reset request.jwt.claim.role;
reset role;
set role anon;

-- 23. Decline after finished -> P0001.
do $$
begin
  begin
    perform vendor_decline_dispatch(current_setting('smoke.d1_token'), 'No longer available');
    raise exception 'expected P0001 declining a finished dispatch';
  exception when sqlstate 'P0001' then null;
  end;
end $$;

-- 24. Any vendor RPC after the request is resolved -> P0001.
reset role;
set role service_role;
set request.jwt.claim.role = 'service_role';
update service_requests set status = 'resolved', resolved_at = now()
where id = current_setting('smoke.d1_request_id')::uuid;
reset request.jwt.claim.role;
reset role;
set role anon;
do $$
begin
  begin
    perform vendor_add_dispatch_note(current_setting('smoke.d1_token'), 'too late now');
    raise exception 'expected P0001 once the parent request is resolved';
  exception when sqlstate 'P0001' then null;
  end;
end $$;

-- 25. vendor_attach_dispatch_invoice as anon -> insufficient_privilege.
do $$
begin
  begin
    perform vendor_attach_dispatch_invoice(current_setting('smoke.d1_token'), 'x/dispatch-invoices/y/z.pdf');
    raise exception 'expected insufficient_privilege for anon calling vendor_attach_dispatch_invoice';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 26. claim_dispatch_sla_alerts / mark_dispatch_sent as anon and as
-- authenticated -> insufficient_privilege.
do $$
begin
  begin
    perform claim_dispatch_sla_alerts(now(), 10);
    raise exception 'expected insufficient_privilege for anon calling claim_dispatch_sla_alerts';
  exception when insufficient_privilege then null;
  end;
  begin
    perform mark_dispatch_sent(current_setting('smoke.d1_id')::uuid, true, null);
    raise exception 'expected insufficient_privilege for anon calling mark_dispatch_sent';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
set role authenticated;
set request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000002';
do $$
begin
  begin
    perform claim_dispatch_sla_alerts(now(), 10);
    raise exception 'expected insufficient_privilege for authenticated calling claim_dispatch_sla_alerts';
  exception when insufficient_privilege then null;
  end;
  begin
    perform mark_dispatch_sent(current_setting('smoke.d1_id')::uuid, true, null);
    raise exception 'expected insufficient_privilege for authenticated calling mark_dispatch_sent';
  exception when insufficient_privilege then null;
  end;
end $$;
reset request.jwt.claim.sub;
reset role;

-- 19. D2 is completely unaffected by every D1-token call above.
set role service_role;
set request.jwt.claim.role = 'service_role';
do $$
declare v_status dispatch_status; v_ack timestamptz; v_eta timestamptz; v_notes text;
begin
  select status, acknowledged_at, eta_at, vendor_notes
  into v_status, v_ack, v_eta, v_notes
  from dispatches where id = current_setting('smoke.d2_id')::uuid;

  if v_status <> 'sent' then raise exception 'LEAK: D2 status changed to %', v_status; end if;
  if v_ack is not null then raise exception 'LEAK: D2 acknowledged_at changed'; end if;
  if v_eta is not null then raise exception 'LEAK: D2 eta_at changed'; end if;
  if v_notes is not null then raise exception 'LEAK: D2 vendor_notes changed'; end if;
end $$;
reset request.jwt.claim.role;
reset role;

-- ============================================================================
-- Cross-tenant (P vs O)
-- ============================================================================

-- 27. As P's owner: zero visibility into O's tables.
set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
do $$
declare n int;
begin
  select count(*) into n from vendors where company_id = 'b0000000-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'LEAK: P sees O vendors'; end if;
  select count(*) into n from locations where company_id = 'b0000000-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'LEAK: P sees O locations'; end if;
  select count(*) into n from dispatches where company_id = 'b0000000-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'LEAK: P sees O dispatches'; end if;
  select count(*) into n from category_default_vendors where company_id = 'b0000000-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'LEAK: P sees O category_default_vendors'; end if;
  select count(*) into n from site_pin_passes where company_id = 'b0000000-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'LEAK: P sees O site_pin_passes'; end if;
  select count(*) into n from staff_badges where company_id = 'b0000000-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'LEAK: P sees O staff_badges'; end if;
end $$;

-- 28. As P's owner: insert with company_id = O -> fails.
do $$
begin
  begin
    insert into vendors (company_id, name) values ('b0000000-0000-0000-0000-000000000001', 'Hostile Insert');
    raise exception 'cross-tenant vendor insert should have failed';
  exception when insufficient_privilege or check_violation then null;
  end;
  begin
    -- O's company is already at its plan's location limit (by seed design),
    -- so enforce_location_limit's BEFORE INSERT trigger legitimately raises
    -- first (P0001), before the RLS WITH CHECK on company_id ever evaluates
    -- — either way the cross-tenant insert never lands, so accept both.
    insert into locations (company_id, name) values ('b0000000-0000-0000-0000-000000000001', 'Hostile Location');
    raise exception 'cross-tenant location insert should have failed';
  exception when insufficient_privilege or check_violation or sqlstate 'P0001' then null;
  end;
end $$;

-- 29. As P's owner: update O's location's site_pin -> 0 rows.
do $$
begin
  update locations set site_pin = '0000' where company_id = 'b0000000-0000-0000-0000-000000000001';
  if found then raise exception 'cross-tenant location update should affect 0 rows'; end if;
end $$;
reset request.jwt.claim.sub;
reset role;

-- 30. As O's technician: own vendors/locations visible + insertable;
-- delete from vendors affects 0 rows (owner-only delete policy).
set role authenticated;
set request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000003';
do $$
declare n int;
begin
  select count(*) into n from vendors where company_id = 'b0000000-0000-0000-0000-000000000001';
  if n = 0 then raise exception 'expected O technician to see own vendors'; end if;
  select count(*) into n from locations where company_id = 'b0000000-0000-0000-0000-000000000001';
  if n = 0 then raise exception 'expected O technician to see own locations'; end if;

  insert into vendors (company_id, name, email) values
    ('b0000000-0000-0000-0000-000000000001', 'Tech-added Vendor', 'tech-vendor@x.test');

  delete from vendors where company_id = 'b0000000-0000-0000-0000-000000000001' and name = 'Tech-added Vendor';
  if found then raise exception 'technician delete on vendors should affect 0 rows (owner-only policy)'; end if;
end $$;
reset request.jwt.claim.sub;
reset role;

-- 31. As O's owner: direct insert into dispatches -> fails (no insert policy).
set role authenticated;
set request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000002';
do $$
begin
  begin
    insert into dispatches (company_id, service_request_id, vendor_id) values (
      'b0000000-0000-0000-0000-000000000001', current_setting('smoke.d1_request_id')::uuid,
      'b0000000-0000-0000-0000-000000000005'
    );
    raise exception 'direct dispatches insert should have failed (no insert policy)';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 32. As O's owner: insert into equipment_access -> fails; table stays empty.
do $$
begin
  begin
    insert into equipment_access (equipment_id, company_id, relationship) values (
      'b0000000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-000000000001', 'owner'
    );
    raise exception 'equipment_access insert should have failed (no insert policy)';
  exception when insufficient_privilege then null;
  end;
end $$;
reset request.jwt.claim.sub;
reset role;

set role service_role;
set request.jwt.claim.role = 'service_role';
do $$
declare n int;
begin
  select count(*) into n from equipment_access;
  if n <> 0 then raise exception 'equipment_access must stay empty, found %', n; end if;
end $$;
reset request.jwt.claim.role;
reset role;

-- ============================================================================
-- Plans and limits
-- ============================================================================

-- Fresh lapsed owner company (trial already expired, no subscription).
insert into auth.users (id, email) values ('c0000000-0000-0000-0000-000000000002', 'ol-owner@x.test');
insert into companies (id, name, slug, notification_email, kind, trial_ends_at) values
  ('c0000000-0000-0000-0000-000000000001', 'Lapsed Diner', 'lapsed-diner', 'ol-notify@x.test',
   'equipment_owner', now() - interval '1 day');
insert into profiles (id, company_id, full_name, role) values
  ('c0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'OL Owner', 'owner');
insert into equipment_types (id, company_id, name) values
  ('c0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'Cooler');

set role authenticated;
set request.jwt.claim.sub = 'c0000000-0000-0000-0000-000000000002';

-- 33. Lapsed owner entitlements: free / not locked / max_locations=1.
do $$
declare v json;
begin
  v := get_company_entitlements();
  if v->>'plan_id' <> 'free' then raise exception 'expected plan_id=free, got %', v->>'plan_id'; end if;
  if (v->>'is_locked')::boolean is not false then raise exception 'expected is_locked=false for a lapsed owner'; end if;
  if v->>'company_kind' <> 'equipment_owner' then raise exception 'expected company_kind=equipment_owner'; end if;
  if (v->>'max_locations')::int <> 1 then raise exception 'expected max_locations=1, got %', v->>'max_locations'; end if;
end $$;

-- 34. 11th unit -> EQUIPMENT_LIMIT_REACHED.
do $$
declare i int;
begin
  for i in 1..10 loop
    insert into equipment (company_id, equipment_type_id, name)
    values ('c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 'Unit ' || i);
  end loop;
end $$;
do $$
begin
  begin
    insert into equipment (company_id, equipment_type_id, name)
    values ('c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 'Unit 11');
    raise exception 'expected EQUIPMENT_LIMIT_REACHED on the 11th unit';
  exception
    when others then
      if sqlerrm not like 'EQUIPMENT_LIMIT_REACHED%' then raise; end if;
  end;
end $$;

-- 35. 2nd location -> LOCATION_LIMIT_REACHED.
insert into locations (company_id, name) values ('c0000000-0000-0000-0000-000000000001', 'First Site');
do $$
begin
  begin
    insert into locations (company_id, name) values ('c0000000-0000-0000-0000-000000000001', 'Second Site');
    raise exception 'expected LOCATION_LIMIT_REACHED on the 2nd location';
  exception
    when others then
      if sqlerrm not like 'LOCATION_LIMIT_REACHED%' then raise; end if;
  end;
end $$;
reset request.jwt.claim.sub;
reset role;

-- 36. Lapsed PROVIDER company: unchanged (locked, starter).
insert into auth.users (id, email) values ('c0000000-0000-0000-0000-000000000005', 'pl-owner@x.test');
insert into companies (id, name, slug, notification_email, trial_ends_at) values
  ('c0000000-0000-0000-0000-000000000004', 'Lapsed Provider', 'lapsed-provider', 'pl-notify@x.test',
   now() - interval '1 day');
insert into profiles (id, company_id, full_name, role) values
  ('c0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000004', 'PL Owner', 'owner');

set role authenticated;
set request.jwt.claim.sub = 'c0000000-0000-0000-0000-000000000005';
do $$
declare v json;
begin
  v := get_company_entitlements();
  if (v->>'is_locked')::boolean is not true then raise exception 'expected is_locked=true for a lapsed provider'; end if;
  if v->>'plan_id' <> 'starter' then raise exception 'expected plan_id=starter, got %', v->>'plan_id'; end if;
end $$;
reset request.jwt.claim.sub;
reset role;

-- ============================================================================
-- Sign-up: create_company_and_profile arity
-- ============================================================================

-- 37. 3-arg call still defaults to service_provider.
insert into auth.users (id, email) values ('c0000000-0000-0000-0000-000000000010', 'new-signup-3arg@x.test');
set role authenticated;
set request.jwt.claim.sub = 'c0000000-0000-0000-0000-000000000010';
select create_company_and_profile('New Co 3arg', 'notify3@x.test', 'New Owner') as cc3 \gset
select set_config('smoke.cc3', :'cc3', false);
do $$
declare v_kind company_kind;
begin
  select kind into v_kind from companies where id = current_setting('smoke.cc3')::uuid;
  if v_kind <> 'service_provider' then
    raise exception 'expected the 3-arg call to default to service_provider, got %', v_kind;
  end if;
end $$;
reset request.jwt.claim.sub;
reset role;

-- 38. 4-arg call with 'equipment_owner' sets the kind.
insert into auth.users (id, email) values ('c0000000-0000-0000-0000-000000000011', 'new-signup-4arg@x.test');
set role authenticated;
set request.jwt.claim.sub = 'c0000000-0000-0000-0000-000000000011';
select create_company_and_profile('New Co 4arg', 'notify4@x.test', 'New Owner 2', 'equipment_owner') as cc4 \gset
select set_config('smoke.cc4', :'cc4', false);
do $$
declare v_kind company_kind;
begin
  select kind into v_kind from companies where id = current_setting('smoke.cc4')::uuid;
  if v_kind <> 'equipment_owner' then raise exception 'expected the 4-arg call to set kind=equipment_owner, got %', v_kind; end if;
end $$;
reset request.jwt.claim.sub;
reset role;

-- 39. 4-arg call with an invalid kind -> 22023.
insert into auth.users (id, email) values ('c0000000-0000-0000-0000-000000000012', 'new-signup-bad@x.test');
set role authenticated;
set request.jwt.claim.sub = 'c0000000-0000-0000-0000-000000000012';
do $$
begin
  begin
    perform create_company_and_profile('Bad Co', 'notifyx@x.test', 'Bad Owner', 'nonsense');
    raise exception 'expected 22023 for an invalid company kind';
  exception when sqlstate '22023' then null;
  end;
end $$;
reset request.jwt.claim.sub;
reset role;

-- ============================================================================
-- Regression: the provider path stays byte-compatible.
-- ============================================================================
set role anon;
select (resolve_qr_code('ptoken0000000000000001'))->'guide'->'company'->>'kind' as p_kind_regression;
select (submit_service_request('ptoken0000000000000001', 'Regression check', 'Reg Tester', 'reg@x.test', null))
  ->>'company_name' as p_submit_regression;
reset role;

-- ============================================================================
-- security review -- BEGIN
-- ============================================================================
-- Assertions added by the independent security review of the owner stack.
-- Each one is an attack that SUCCEEDED against 0024/0025 before
-- 0026_owner_security_review.sql; see that file's header for the write-up.
-- P = the provider company (a0000000-...-0001), O = the owner company
-- (b0000000-...-0001).

-- A location and a vendor that belong to P, never to O.
insert into locations (id, company_id, name, site_pin) values
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'P Depot', '9999');
insert into vendors (id, company_id, name, email) values
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'P Secret Vendor', 'psecret@x.test');

-- SR1. O's own staff cannot point O's equipment at P's vendor / warranty
-- vendor / location. RLS on `equipment` only constrains company_id, so this
-- UPDATE passes the policy -- a 42501 here can only come from the trigger.
-- Before 0026 all three succeeded, which is what made SR2 and SR3 possible
-- and would have emailed a work order to another tenant's vendor.
set role authenticated;
set request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000002';  -- O's owner
do $$
begin
  begin
    update equipment set vendor_id = 'c0000000-0000-0000-0000-000000000002'
    where id = 'b0000000-0000-0000-0000-000000000007';
    raise exception 'CROSS-TENANT: equipment.vendor_id accepted another company''s vendor';
  exception when insufficient_privilege then
    raise notice 'ok: equipment.vendor_id rejects a foreign vendor';
  end;

  begin
    update equipment set warranty_vendor_id = 'c0000000-0000-0000-0000-000000000002'
    where id = 'b0000000-0000-0000-0000-000000000007';
    raise exception 'CROSS-TENANT: equipment.warranty_vendor_id accepted another company''s vendor';
  exception when insufficient_privilege then
    raise notice 'ok: equipment.warranty_vendor_id rejects a foreign vendor';
  end;

  begin
    update equipment set location_id = 'c0000000-0000-0000-0000-000000000001'
    where id = 'b0000000-0000-0000-0000-000000000007';
    raise exception 'CROSS-TENANT: equipment.location_id accepted another company''s location';
  exception when insufficient_privilege then
    raise notice 'ok: equipment.location_id rejects a foreign location';
  end;
end $$;
reset request.jwt.claim.sub;
reset role;

-- SR1b. Same rule on service_requests.location_id (0020 lets staff insert a
-- request directly and that policy, too, only constrains company_id). Run as
-- superuser so RLS cannot be what rejects it -- the trigger must.
do $$
begin
  insert into service_requests (company_id, equipment_id, location_id, description, contact_name, source)
  values ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000007',
          'c0000000-0000-0000-0000-000000000001', 'foreign location', 'Mallory', 'staff');
  raise exception 'CROSS-TENANT: service_requests.location_id accepted another company''s location';
exception when insufficient_privilege then
  raise notice 'ok: service_requests.location_id rejects a foreign location';
end $$;

-- SR2. Consequence check: O's sticker still resolves to O's OWN location, so
-- resolve_qr_code() cannot be steered into publishing P's location name.
set role anon;
do $$
declare v json;
begin
  v := resolve_qr_code('otoken0000000000000001')->'guide'->'location';
  if (v->>'id') is distinct from 'b0000000-0000-0000-0000-000000000004' then
    raise exception 'CROSS-TENANT: resolve_qr_code returned location %', v;
  end if;
  raise notice 'ok: resolve_qr_code still returns only the unit''s own location';
end $$;

-- SR3. ...and verify_site_pin() can only ever be an oracle for the PIN of the
-- unit's own location: P's '9999' must not validate through O's sticker.
-- (54000 means the location bucket is already spent by the brute-force
-- assertion above -- also "did not validate", which is what this asserts.)
do $$
declare v json;
begin
  v := verify_site_pin('otoken0000000000000001', '9999');
  if (v->>'ok')::boolean then
    raise exception 'CROSS-TENANT: another company''s site PIN validated through this sticker';
  end if;
  raise notice 'ok: a foreign site PIN does not validate';
exception when sqlstate '54000' then
  raise notice 'ok: rate limited before comparison (still not validated)';
end $$;

-- SR4. submit_owner_service_request() is granted to anon, so the route's
-- isOwnedUploadPath() check in src/lib/public-request.ts is not a boundary.
-- An attachment path outside the scanned token's own prefix would let a
-- direct anon-key call name any object in the service-request-media bucket --
-- 0001's "Company staff can view their own service request media" storage
-- policy matches on service_request_media.storage_path, so the row alone
-- grants the read. Validation runs before the PIN gate, so no pass is needed
-- to reach it.
do $$
begin
  begin
    perform submit_owner_service_request(
      'otoken0000000000000002', 'foreign media', 'Mallory', null, '{}'::text[], 'normal',
      '[{"storage_path":"someone-elses-token/secret.jpg","media_type":"image"}]'::jsonb, null);
    raise exception 'LEAK: a foreign attachment path was accepted';
  exception when sqlstate '22023' then
    raise notice 'ok: foreign attachment path rejected';
  end;

  begin
    perform submit_owner_service_request(
      'otoken0000000000000002', 'traversal media', 'Mallory', null, '{}'::text[], 'normal',
      '[{"storage_path":"otoken0000000000000002/../other/secret.jpg","media_type":"image"}]'::jsonb, null);
    raise exception 'LEAK: a traversal attachment path was accepted';
  exception when sqlstate '22023' then
    raise notice 'ok: traversal attachment path rejected';
  end;

  begin
    perform submit_owner_service_request(
      'otoken0000000000000002', 'too much media', 'Mallory', null, '{}'::text[], 'normal',
      (select jsonb_agg(jsonb_build_object(
         'storage_path', 'otoken0000000000000002/' || g || '.jpg', 'media_type', 'image'))
       from generate_series(1, 7) g), null);
    raise exception 'LEAK: 7 attachments were accepted';
  exception when sqlstate '22023' then
    raise notice 'ok: attachment count capped at 6';
  end;
end $$;

-- SR4b. Nothing above wrote a media row.
do $$
declare v_n int;
begin
  select count(*) into v_n from service_request_media where storage_path not like 'otoken%';
  if v_n <> 0 then
    raise exception 'LEAK: % service_request_media row(s) name a foreign object', v_n;
  end if;
  raise notice 'ok: no foreign-object media rows exist';
end $$;

-- SR5. The provider RPC must not accept owner-kind equipment: it has no site
-- PIN gate, so accepting O's sticker walked straight past the only access
-- control the owner report flow has.
do $$
begin
  perform submit_service_request('otoken0000000000000001', 'pin bypass', 'Mallory', 'm@x.test', '555');
  raise exception 'BYPASS: submit_service_request accepted owner-kind equipment';
exception when sqlstate 'P0003' then
  raise notice 'ok: submit_service_request rejects owner-kind equipment (P0003)';
end $$;

-- SR6. Anon still sees nothing in any of the seven new tables.
do $$
declare v_n int;
begin
  select (select count(*) from locations) + (select count(*) from vendors)
       + (select count(*) from category_default_vendors) + (select count(*) from dispatches)
       + (select count(*) from staff_badges) + (select count(*) from equipment_access)
       + (select count(*) from site_pin_passes)
  into v_n;
  if v_n <> 0 then
    raise exception 'LEAK: anon can read % row(s) across the new tables', v_n;
  end if;
  raise notice 'ok: anon reads nothing from the seven new tables';
end $$;
reset role;

-- SR7. Grants. Supabase's default privileges grant EXECUTE on every new
-- function in `public` to anon/authenticated, and `revoke ... from public`
-- does NOT undo a role grant -- which is how the 4-arg
-- create_company_and_profile() shipped anon-callable.
do $$
declare v_bad text;
begin
  select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ')
  into v_bad
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and has_function_privilege('anon', p.oid, 'execute')
    and p.proname in (
      'create_company_and_profile', 'check_rate_limit', 'mark_dispatch_sent',
      'claim_dispatch_sla_alerts', 'vendor_attach_dispatch_invoice',
      'enforce_location_limit', 'dispatches_sync_request',
      'enforce_equipment_tenant_refs', 'enforce_service_request_tenant_refs',
      'assert_submission_media_ok'
    );
  if v_bad is not null then
    raise exception 'GRANT: anon can execute %', v_bad;
  end if;
  raise notice 'ok: no staff-only or trigger-only function is anon-callable';
end $$;

-- SR8. Every SECURITY DEFINER function in `public` pins search_path.
do $$
declare v_bad text;
begin
  select string_agg(p.proname, ', ') into v_bad
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and (p.proconfig is null or not (p.proconfig @> array['search_path=public']));
  if v_bad is not null then
    raise exception 'SEARCH_PATH: security definer function(s) without a pinned search_path: %', v_bad;
  end if;
  raise notice 'ok: every security definer function pins search_path=public';
end $$;

-- ============================================================================
-- security review -- END
-- ============================================================================

select 'smoke-owner OK' as result;
