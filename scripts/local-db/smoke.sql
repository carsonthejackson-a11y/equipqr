\set ON_ERROR_STOP on
-- seed
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111','owner@x.test');
insert into companies (id,name,slug,notification_email) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Acme','acme','n@x.test');
insert into profiles (id,company_id,full_name,role) values ('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Own','owner');
insert into customers (id,company_id,name) values ('cccccccc-cccc-cccc-cccc-cccccccccccc','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Cafe');
insert into equipment_types (id,company_id,name) values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Espresso');
insert into equipment (id,company_id,equipment_type_id,customer_id,name) values ('dddddddd-dddd-dddd-dddd-dddddddddddd','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','cccccccc-cccc-cccc-cccc-cccccccccccc','La Marzocco #1');
-- legacy 24-hex token code
insert into qr_codes (token,company_id,equipment_id,source,claimed_at) values ('0123456789abcdef01234567','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','dddddddd-dddd-dddd-dddd-dddddddddddd','instant',now());
select token, short_code, status from qr_codes;

select lower(substr(short_code,1,4)||'-'||substr(short_code,5)) as sc from qr_codes limit 1 \gset
set role anon;
select (resolve_qr_code('0123456789abcdef01234567'))->>'status' as by_token;
select (resolve_qr_code(:'sc'))->>'status' as by_short;
select (resolve_qr_code('nope'))->>'status' as missing;
select resolve_qr_code('0123456789abcdef01234567')->'guide'->'company' as company;
select record_scan('0123456789abcdef01234567','ua','short_code');
select submit_service_request('0123456789abcdef01234567','Broken','Bob','bob@x.test','555',
  '[{"storage_path":"a/b.jpg","media_type":"image"}]'::jsonb,'[]'::jsonb,'high') as submit \gset
-- 0018: an anon caller must never see the company's internal notification inbox.
do $$
declare v text;
begin
  select (submit_service_request('0123456789abcdef01234567','Anon leak probe','Eve','eve@x.test','555',
    '[]'::jsonb,'[]'::jsonb,'low'))->>'company_notification_email' into v;
  if v is not null then
    raise exception 'LEAK: anon got company_notification_email = %', v;
  end if;
  raise notice 'ok: anon sees company_notification_email = null';
end $$;
-- 0018: check_rate_limit() is service-role only. An anon caller poisoning
-- another visitor's bucket is what this revoke prevents.
do $$
begin
  perform check_rate_limit('ip:1.2.3.4',2,60);
  raise exception 'LEAK: anon may still call check_rate_limit()';
exception
  when insufficient_privilege then
    raise notice 'ok: check_rate_limit denied to anon';
end $$;
reset role;
-- The limiter itself still works for the service role (2 allowed, 3rd over).
set role service_role;
select check_rate_limit('ip:1.2.3.4',2,60), check_rate_limit('ip:1.2.3.4',2,60), check_rate_limit('ip:1.2.3.4',2,60);
reset role;
select public_token as pt from service_requests order by created_at limit 1 \gset
set role anon;
select (get_request_status(:'pt'))->>'status' as pub_status,
       json_array_length((get_request_status(:'pt'))->'activity') as activity_n;
select get_request_status('bogus') is null as bogus_null;
reset role;

-- staff (owner) session
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select count(*) as visible_events from equipment_events;
select count(*) as visible_activity from request_activity;
insert into request_activity (company_id, service_request_id, kind, body, author_user_id)
  select company_id, id, 'note', 'internal note', auth.uid() from service_requests;
update service_requests set status='in_progress', assigned_to='11111111-1111-1111-1111-111111111111';
update service_requests set status='resolved', resolution_summary='fixed';
select status, resolved_at is not null as has_resolved, status_updated_at >= created_at as su from service_requests;
select last_serviced_at is not null as stamped from equipment;
select kind from equipment_events order by occurred_at;
-- replace code
select (replace_qr_code((select id from qr_codes where status='active'))).short_code as new_short;
select token, status, replaced_by_id is not null as has_repl, equipment_id is not null as still_linked from qr_codes order by created_at;
select get_equipment_scan_stats('dddddddd-dddd-dddd-dddd-dddddddddddd');
reset role;
-- old replaced sticker still resolves
set role anon;
select (resolve_qr_code('0123456789abcdef01234567'))->>'status' as old_sticker_still_works;
reset role;
-- retire the new one
set role authenticated;
select retire_qr_code((select id from qr_codes where status='active'));
reset role;
set role anon;
select (resolve_qr_code((select token from qr_codes where status='retired')))->>'status' as retired_status;
reset role;
-- api key resolve as service_role
insert into api_keys (company_id,name,key_prefix,key_hash) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','k','eqr_live_abc','hash1');
set role service_role;
select * from resolve_api_key('hash1');
select * from resolve_api_key('nah');
reset role;

-- ============================================================================
-- Multi-tenant isolation: a second company, and what company A's owner can
-- see and do about it. Seeded here (not at the top) so every assertion above
-- keeps its original single-tenant output.
-- ============================================================================
insert into auth.users (id, email) values ('22222222-2222-2222-2222-222222222222','owner@b.test');
insert into companies (id,name,slug,notification_email) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Beta','beta','n@b.test');
insert into profiles (id,company_id,full_name,role) values ('22222222-2222-2222-2222-222222222222','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','OwnB','owner');
insert into equipment_types (id,company_id,name) values ('ffffffff-ffff-ffff-ffff-ffffffffffff','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Grinder');
insert into equipment (id,company_id,equipment_type_id,name) values ('bbbbbbb1-bbbb-bbbb-bbbb-bbbbbbbbbbbb','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','ffffffff-ffff-ffff-ffff-ffffffffffff','Mahlkonig #1');
insert into qr_codes (id,token,short_code,company_id,equipment_id,source,status,claimed_at)
  values ('bbbbbbb2-bbbb-bbbb-bbbb-bbbbbbbbbbbb','BQRTOKEN2','BQRTKN22','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','bbbbbbb1-bbbb-bbbb-bbbb-bbbbbbbbbbbb','instant','active',now());
insert into service_requests (id,equipment_id,company_id,description,contact_name)
  values ('bbbbbbb3-bbbb-bbbb-bbbb-bbbbbbbbbbbb','bbbbbbb1-bbbb-bbbb-bbbb-bbbbbbbbbbbb','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','B is broken','Bea');
insert into equipment_events (company_id,equipment_id,kind,summary,actor_kind)
  values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','bbbbbbb1-bbbb-bbbb-bbbb-bbbbbbbbbbbb','note','B note','staff');

-- Company A's owner is still the session (request.jwt.claim.sub set above).
set role authenticated;
select (select count(*) from equipment) as a_equipment,
       (select count(*) from qr_codes) as a_qr_codes,
       (select count(*) from service_requests) as a_requests,
       (select count(*) from equipment_events) as a_events;

do $$
declare
  v_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_b uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  t text;
  v_all int;
  v_own int;
  v_foreign int;
begin
  foreach t in array array['equipment','qr_codes','service_requests','equipment_events']
  loop
    execute format('select count(*) from %I', t) into v_all;
    execute format('select count(*) from %I where company_id = $1', t) into v_own using v_a;
    execute format('select count(*) from %I where company_id = $1', t) into v_foreign using v_b;

    if v_foreign <> 0 then
      raise exception 'TENANT LEAK: owner A sees % row(s) of company B in %', v_foreign, t;
    end if;
    if v_all <> v_own then
      raise exception 'TENANT LEAK: % visible rows in % but only % belong to company A', v_all, t, v_own;
    end if;
    if v_own = 0 then
      raise exception 'RLS TOO TIGHT: owner A sees none of its own % rows', t;
    end if;
    raise notice 'ok: % — % own row(s) visible, 0 foreign', t, v_own;
  end loop;
end $$;

-- Writing across the tenant boundary must be refused, not silently no-op.
do $$
begin
  perform reassign_qr_code('bbbbbbb2-bbbb-bbbb-bbbb-bbbbbbbbbbbb','bbbbbbb1-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  raise exception 'TENANT LEAK: owner A reassigned company B''s code';
exception
  when others then
    if sqlerrm like 'TENANT LEAK%' then raise; end if;
    raise notice 'ok: reassign_qr_code on B''s code raised "%"', sqlerrm;
end $$;

-- Also refused when the *equipment* is B's and the code is A's.
do $$
begin
  perform reassign_qr_code((select id from qr_codes limit 1),'bbbbbbb1-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  raise exception 'TENANT LEAK: owner A attached its code to company B''s equipment';
exception
  when others then
    if sqlerrm like 'TENANT LEAK%' then raise; end if;
    raise notice 'ok: reassign_qr_code onto B''s equipment raised "%"', sqlerrm;
end $$;

do $$
begin
  perform retire_qr_code('bbbbbbb2-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  raise exception 'TENANT LEAK: owner A retired company B''s code';
exception
  when others then
    if sqlerrm like 'TENANT LEAK%' then raise; end if;
    raise notice 'ok: retire_qr_code on B''s code raised "%"', sqlerrm;
end $$;

-- B's code really is untouched.
reset role;
select status, equipment_id is not null as still_linked from qr_codes where id = 'bbbbbbb2-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

-- ============================================================================
-- 0018: the service role — and only the service role — gets the company's
-- notification inbox back from submit_service_request(). There is no
-- PostgREST here to set the claim, so we set it by hand; see docs/RUNBOOK.md.
-- ============================================================================
set role service_role;
set request.jwt.claim.role = 'service_role';
select is_service_role() as claim_seen,
       auth.uid() as uid_still_works;  -- the two GUCs are independent
do $$
declare v text;
begin
  select (submit_service_request('0123456789abcdef01234567','Service role probe','Sam','sam@x.test','555',
    '[]'::jsonb,'[]'::jsonb,'normal'))->>'company_notification_email' into v;
  if v is distinct from 'n@x.test' then
    raise exception 'service role got company_notification_email = %, expected n@x.test', coalesce(v,'<null>');
  end if;
  raise notice 'ok: service role sees company_notification_email = %', v;
end $$;
reset request.jwt.claim.role;
-- Claim dropped: the same call is back to null even as the service_role DB role.
select (submit_service_request('0123456789abcdef01234567','No claim probe','Nel','nel@x.test','555',
  '[]'::jsonb,'[]'::jsonb,'normal'))->>'company_notification_email' is null as null_without_claim;
reset role;

reset request.jwt.claim.sub;
set role anon;
select count(*) from equipment_events;
\echo EXPECT ERROR NEXT
select retire_qr_code(gen_random_uuid());
