\set ON_ERROR_STOP on
-- Smoke test for migration 0019 (Next roadmap foundation). Run after
-- `db.sh reset` on a fresh database:
--   psql "$(scripts/local-db/db.sh url)" -f scripts/local-db/smoke-next.sql

-- seed
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','owner@x.test'),
  ('22222222-2222-2222-2222-222222222222','tech@x.test');
insert into companies (id,name,slug,notification_email,timezone) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Acme','acme','n@x.test','America/Chicago');
insert into profiles (id,company_id,full_name,role) values
  ('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Own Er','owner'),
  ('22222222-2222-2222-2222-222222222222','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Tech Nician','technician');
insert into customers (id,company_id,name,contact_email) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Cafe','cafe@x.test');
insert into equipment_types (id,company_id,name) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Espresso');
insert into equipment (id,company_id,equipment_type_id,customer_id,name) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','cccccccc-cccc-cccc-cccc-cccccccccccc','La Marzocco #1');
insert into qr_codes (token,company_id,equipment_id,source,claimed_at) values
  ('0123456789abcdef01234567','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','dddddddd-dddd-dddd-dddd-dddddddddddd','instant',now());

-- ---------------------------------------------------------------------------
-- anon: scan → no open requests → submit → scan shows it → add a customer note
-- ---------------------------------------------------------------------------
set role anon;
do $$
declare v json;
begin
  v := resolve_qr_code('0123456789abcdef01234567');
  if json_array_length(v->'guide'->'open_requests') <> 0 then raise exception 'expected 0 open requests'; end if;
  if not ((v->'guide'->'equipment')::jsonb ? 'next_service_due_on') then raise exception 'next_service_due_on missing'; end if;
end $$;

select submit_service_request('0123456789abcdef01234567','Steam wand leaking','Bob Jones','bob@x.test',null,
  '[{"storage_path":"0123456789abcdef01234567/a.jpg","media_type":"image"}]'::jsonb,'[]'::jsonb,'high') as submit \gset
select set_config('smoke.submit', :'submit', false);
select (:'submit'::json)->>'public_token' as tok \gset
select set_config('smoke.tok', :'tok', false);

do $$
declare v json; r json;
begin
  v := resolve_qr_code('0123456789abcdef01234567');
  if json_array_length(v->'guide'->'open_requests') <> 1 then raise exception 'expected 1 open request'; end if;
  r := (v->'guide'->'open_requests')->0;
  if r->>'contact_first_name' <> 'Bob' then raise exception 'first name only, got %', r->>'contact_first_name'; end if;
  if (r::jsonb ? 'contact_email') then raise exception 'email must not be exposed'; end if;
  if r->>'public_token' is null then raise exception 'public_token missing'; end if;
  if (r->>'update_count')::int <> 1 then raise exception 'expected 1 customer-visible update, got %', r->>'update_count'; end if;
end $$;

-- customer note on the open request (anon)
select add_customer_request_update(:'tok', 'Still leaking this morning, worse now', 'Alice', '555-0100', null) as upd \gset
select set_config('smoke.upd', :'upd', false);
do $$
declare v json := current_setting('smoke.upd')::json;
begin
  if v->>'company_notification_email' is not null then raise exception 'LEAK: anon got notification_email'; end if;
  if v->>'assigned_to_email' is not null then raise exception 'LEAK: anon got assignee email'; end if;
  if v->>'equipment_name' <> 'La Marzocco #1' then raise exception 'equipment_name wrong'; end if;
end $$;

-- too short / bogus token / must fail
do $$
begin
  begin
    perform add_customer_request_update(current_setting('smoke.tok'), 'x', null, null, null);
    raise exception 'short body should have failed';
  exception when sqlstate '22023' then null; end;
  begin
    perform add_customer_request_update('nope', 'hello there', null, null, null);
    raise exception 'bogus token should have failed';
  exception when sqlstate 'P0002' then null; end;
end $$;

-- status page shows the message
do $$
declare v json;
begin
  v := get_request_status(current_setting('smoke.tok'));
  if json_array_length(v->'activity') <> 2 then raise exception 'expected 2 customer-visible rows, got %', json_array_length(v->'activity'); end if;
  if (v->'activity')->1->>'author_kind' <> 'customer' then raise exception 'expected customer author'; end if;
end $$;

-- media row got company_id via trigger
reset role;
do $$
declare v uuid;
begin
  select company_id into v from service_request_media limit 1;
  if v is null then raise exception 'media company_id not set by trigger'; end if;
end $$;

-- service role sees the notification email + assignee email
set role service_role;
set request.jwt.claim.role = 'service_role';
update service_requests set assigned_to = '22222222-2222-2222-2222-222222222222' where public_token = current_setting('smoke.tok');
do $$
declare v json;
begin
  v := add_customer_request_update(current_setting('smoke.tok'), 'Service-role probe message', 'Alice', null, null);
  if v->>'company_notification_email' <> 'n@x.test' then raise exception 'service role should see notification email'; end if;
  if v->>'assigned_to_email' <> 'tech@x.test' then raise exception 'service role should see assignee email, got %', v->>'assigned_to_email'; end if;
end $$;
reset request.jwt.claim.role;
reset role;

-- unread counter
do $$
declare n int;
begin
  select unread_customer_messages into n from service_requests where public_token = current_setting('smoke.tok');
  if n <> 2 then raise exception 'expected unread 2, got %', n; end if;
end $$;

-- ---------------------------------------------------------------------------
-- staff (technician): checklist template, inspection, maintenance schedule,
-- staff media, close-out, company batch (owner only)
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

insert into checklist_templates (company_id, equipment_type_id, name, items)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','90-day PM',
  '[{"id":"i1","label":"Descale boiler","kind":"check","required":true,"help":null},
    {"id":"i2","label":"Group gasket condition","kind":"pass_fail","required":true,"help":null}]'::jsonb)
returning id as tpl \gset
select set_config('smoke.tpl', :'tpl', false);

insert into inspections (company_id, equipment_id, checklist_template_id, performed_by, template_name, items)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','dddddddd-dddd-dddd-dddd-dddddddddddd', current_setting('smoke.tpl')::uuid,
  '22222222-2222-2222-2222-222222222222','90-day PM','[]'::jsonb)
returning id as insp \gset
select set_config('smoke.insp', :'insp', false);

update inspections set status='completed', completed_at=now(), failed_count=1,
  signature_path='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/inspections/x/sig.png', signed_by_name='Bob'
where id = current_setting('smoke.insp')::uuid;

-- maintenance schedule keeps equipment.next_service_due_on in sync
insert into maintenance_schedules (company_id, equipment_id, name, interval_days, lead_days, next_due_on, checklist_template_id)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','dddddddd-dddd-dddd-dddd-dddddddddddd','Descale',90,14,current_date + 10, current_setting('smoke.tpl')::uuid)
returning id as ms \gset
select set_config('smoke.ms', :'ms', false);
do $$
declare d date;
begin
  select next_service_due_on into d from equipment where id='dddddddd-dddd-dddd-dddd-dddddddddddd';
  if d <> current_date + 10 then raise exception 'next_service_due_on not synced: %', d; end if;
end $$;

-- staff close-out photo row
insert into service_request_media (service_request_id, company_id, storage_path, media_type, origin, uploaded_by, caption)
select id, company_id, 'staff/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/'||id||'/after.jpg', 'image', 'staff',
       '22222222-2222-2222-2222-222222222222', 'After'
from service_requests where public_token = current_setting('smoke.tok');

-- technician cannot mint a batch
do $$
begin
  begin
    perform generate_company_qr_batch(5);
    raise exception 'technician should not mint batches';
  exception when sqlstate '42501' then null; end;
end $$;

-- owner can
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare n int;
begin
  select count(*) into n from generate_company_qr_batch(3);
  if n <> 3 then raise exception 'expected 3 codes'; end if;
  select count(*) into n from qr_codes where source='batch' and equipment_id is null and company_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if n <> 3 then raise exception 'batch codes missing'; end if;
end $$;

-- close out with signature → PM-less request just resolves
update service_requests set status='resolved', resolution_summary='Replaced wand gasket',
  signature_path='staff/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/sig.png', signed_by_name='Bob', signed_at=now()
where public_token = current_setting('smoke.tok');

reset request.jwt.claim.sub;
reset role;

-- ---------------------------------------------------------------------------
-- cron: PM generation (service role only), once per cycle, resolve rolls forward
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    perform generate_due_maintenance_requests();
    raise exception 'non-service-role should be refused';
  exception when sqlstate '42501' then null; end;
end $$;

set role service_role;
set request.jwt.claim.role = 'service_role';
do $$
declare n int; r json;
begin
  select count(*) into n from generate_due_maintenance_requests();
  if n <> 1 then raise exception 'expected 1 PM request, got %', n; end if;
  select count(*) into n from generate_due_maintenance_requests();
  if n <> 0 then raise exception 'second run should create nothing, got %', n; end if;
  select count(*) into n from service_requests where source='pm' and maintenance_schedule_id = current_setting('smoke.ms')::uuid;
  if n <> 1 then raise exception 'pm request missing'; end if;
  select count(*) into n from equipment_events where kind='pm_due';
  if n <> 1 then raise exception 'pm_due event missing'; end if;
end $$;

-- resolve the PM request → schedule rolls forward by interval, equipment synced
update service_requests set status='resolved', resolution_summary='Descaled' where source='pm';
do $$
declare d date; e date;
begin
  select next_due_on into d from maintenance_schedules where id = current_setting('smoke.ms')::uuid;
  if d <> (now() at time zone 'America/Chicago')::date + 90 then raise exception 'schedule did not roll forward: %', d; end if;
  select next_service_due_on into e from equipment where id='dddddddd-dddd-dddd-dddd-dddddddddddd';
  if e <> d then raise exception 'equipment.next_service_due_on not synced after roll: %', e; end if;
end $$;
reset request.jwt.claim.role;
reset role;

-- ---------------------------------------------------------------------------
-- tenant isolation for the new tables
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values ('33333333-3333-3333-3333-333333333333','other@x.test');
insert into companies (id,name,slug,notification_email) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Other','other','o@x.test');
insert into profiles (id,company_id,full_name,role) values ('33333333-3333-3333-3333-333333333333','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Oth','owner');
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
declare n int;
begin
  select count(*) into n from checklist_templates; if n <> 0 then raise exception 'leak: templates'; end if;
  select count(*) into n from inspections; if n <> 0 then raise exception 'leak: inspections'; end if;
  select count(*) into n from maintenance_schedules; if n <> 0 then raise exception 'leak: schedules'; end if;
  select count(*) into n from service_request_media; if n <> 0 then raise exception 'leak: media'; end if;
  begin
    insert into maintenance_schedules (company_id, equipment_id, name, interval_days, next_due_on)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','dddddddd-dddd-dddd-dddd-dddddddddddd','x',30,current_date);
    raise exception 'cross-tenant insert should fail';
  exception when insufficient_privilege or check_violation then null; end;
end $$;
reset request.jwt.claim.sub;
reset role;

-- ---------------------------------------------------------------------------
-- migration 0021: get_request_status() surfaces the customer message author
-- ---------------------------------------------------------------------------
do $$
declare v json; msg_row json;
begin
  v := get_request_status(current_setting('smoke.tok'));
  msg_row := (v->'activity')->1; -- index 0 is the "request received" system row
  if msg_row->>'author_name' <> 'Alice' then
    raise exception 'expected author_name Alice, got %', msg_row->>'author_name';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- migration 0020: staff-sourced service requests
-- (scan-to-inspect's "N items failed -> create a request")
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

insert into service_requests (equipment_id, company_id, description, contact_name, priority, source, inspection_id)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Failed inspection items: Descale boiler','Cafe','high','staff', current_setting('smoke.insp')::uuid)
returning id as staffreq \gset
select set_config('smoke.staffreq', :'staffreq', false);

do $$
begin
  -- staff cannot spoof a customer/api-sourced request through the direct insert path
  begin
    insert into service_requests (equipment_id, company_id, description, contact_name, source)
    values ('dddddddd-dddd-dddd-dddd-dddddddddddd','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','x','x','scan');
    raise exception 'staff insert with source<>staff should have failed';
  exception when insufficient_privilege or check_violation then null; end;
end $$;

reset request.jwt.claim.sub;
reset role;

-- other company's staff can neither see it nor insert against it
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
declare n int;
begin
  select count(*) into n from service_requests where id = current_setting('smoke.staffreq')::uuid;
  if n <> 0 then raise exception 'leak: cross-tenant staff-sourced request visible'; end if;
  begin
    insert into service_requests (equipment_id, company_id, description, contact_name, source)
    values ('dddddddd-dddd-dddd-dddd-dddddddddddd','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','x','x','staff');
    raise exception 'cross-tenant staff insert should have failed';
  exception when insufficient_privilege or check_violation then null; end;
end $$;
reset request.jwt.claim.sub;
reset role;

-- ---------------------------------------------------------------------------
-- 0019/0020 hardening: own company_id is not enough — the referenced row has
-- to be ours too. Company B's technician here owns a company_id of its own,
-- so every insert below passes the company_id check and must still fail on
-- the equipment / storage-path check.
-- ---------------------------------------------------------------------------
insert into equipment_types (id,company_id,name) values
  ('ffffffff-ffff-ffff-ffff-ffffffffffff','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Other type');
insert into equipment (id,company_id,equipment_type_id,name) values
  ('dddddddd-dddd-dddd-dddd-dddddddddd22','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','ffffffff-ffff-ffff-ffff-ffffffffffff','Other unit');

set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
begin
  -- a PM schedule on someone else's unit would let the security-definer sync
  -- trigger write THEIR equipment.next_service_due_on
  begin
    insert into maintenance_schedules (company_id, equipment_id, name, interval_days, next_due_on)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','dddddddd-dddd-dddd-dddd-dddddddddddd','x',30,current_date);
    raise exception 'schedule on a foreign unit should have failed';
  exception when insufficient_privilege or check_violation then null; end;

  -- an inspection on someone else's unit
  begin
    insert into inspections (company_id, equipment_id, template_name)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','dddddddd-dddd-dddd-dddd-dddddddddddd','x');
    raise exception 'inspection on a foreign unit should have failed';
  exception when insufficient_privilege or check_violation then null; end;

  -- a staff-sourced request on someone else's unit would show up in
  -- resolve_qr_code()'s open_requests on THEIR public scan page
  begin
    insert into service_requests (company_id, equipment_id, description, contact_name, source)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','dddddddd-dddd-dddd-dddd-dddddddddddd','x','x','staff');
    raise exception 'staff request on a foreign unit should have failed';
  exception when insufficient_privilege or check_violation then null; end;

  -- the same three against their own unit still work
  insert into maintenance_schedules (company_id, equipment_id, name, interval_days, next_due_on)
  values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','dddddddd-dddd-dddd-dddd-dddddddddd22','ok',30,current_date);
  insert into inspections (company_id, equipment_id, template_name)
  values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','dddddddd-dddd-dddd-dddd-dddddddddd22','ok');
  insert into service_requests (company_id, equipment_id, description, contact_name, source)
  values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','dddddddd-dddd-dddd-dddd-dddddddddd22','ok','ok','staff');
end $$;
reset request.jwt.claim.sub;
reset role;

-- staff media rows may only name an object under staff/<own company>/<request>/
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare v_req uuid;
begin
  select id into v_req from service_requests where public_token = current_setting('smoke.tok');

  -- another company's customer upload: allowed through, the 0001 storage read
  -- policy would then hand it back as a signed URL
  begin
    insert into service_request_media (service_request_id, company_id, storage_path, media_type, origin, uploaded_by)
    values (v_req, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'someone-elses-token/secret.jpg', 'image', 'staff',
            '22222222-2222-2222-2222-222222222222');
    raise exception 'staff media row with a foreign storage_path should have failed';
  exception when insufficient_privilege or check_violation then null; end;

  -- right prefix, wrong company segment
  begin
    insert into service_request_media (service_request_id, company_id, storage_path, media_type, origin, uploaded_by)
    values (v_req, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            'staff/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/'||v_req||'/x.jpg', 'image', 'staff',
            '22222222-2222-2222-2222-222222222222');
    raise exception 'staff media row under another company prefix should have failed';
  exception when insufficient_privilege or check_violation then null; end;

  -- right prefix, another request of the same company
  begin
    insert into service_request_media (service_request_id, company_id, storage_path, media_type, origin, uploaded_by)
    values (v_req, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            'staff/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/'||gen_random_uuid()||'/x.jpg', 'image', 'staff',
            '22222222-2222-2222-2222-222222222222');
    raise exception 'staff media row for another request should have failed';
  exception when insufficient_privilege or check_violation then null; end;

  -- the shape src/lib/staff-scan.ts actually writes still works
  insert into service_request_media (service_request_id, company_id, storage_path, media_type, origin, uploaded_by)
  values (v_req, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          'staff/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/'||v_req||'/signature.png', 'image', 'staff',
          '22222222-2222-2222-2222-222222222222');
end $$;
reset request.jwt.claim.sub;
reset role;

select 'smoke-next OK' as result;
