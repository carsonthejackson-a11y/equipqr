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
select check_rate_limit('ip:1.2.3.4',2,60), check_rate_limit('ip:1.2.3.4',2,60), check_rate_limit('ip:1.2.3.4',2,60);
reset role;
select public_token as pt from service_requests limit 1 \gset
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
reset request.jwt.claim.sub;
set role anon;
select count(*) from equipment_events;
\echo EXPECT ERROR NEXT
select retire_qr_code(gen_random_uuid());
