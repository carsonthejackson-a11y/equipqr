\set ON_ERROR_STOP on
-- Smoke suite for migration 0019 (Next roadmap foundation). Run after
-- smoke.sql on a fresh `db.sh reset`:
--   psql "$(scripts/local-db/db.sh url)" -f scripts/local-db/smoke.sql
--   psql "$(scripts/local-db/db.sh url)" -f scripts/local-db/smoke-next.sql
-- Depends on the rows smoke.sql seeds (company A / owner / equipment / request).

-- ============================================================================
-- 1. PM reminders: next_service_due_on follows service_interval_days
-- ============================================================================
reset role;
reset request.jwt.claim.sub;
update equipment set last_serviced_at = '2026-01-10T12:00:00Z', service_interval_days = 90
where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
do $$
declare v date;
begin
  select next_service_due_on into v from equipment where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  if v <> date '2026-04-10' then
    raise exception 'PM: expected 2026-04-10, got %', v;
  end if;
  raise notice 'ok: next_service_due_on computed = %', v;
end $$;
-- Logging a later service moves it forward.
update equipment set last_serviced_at = '2026-03-01T12:00:00Z'
where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
do $$
declare v date;
begin
  select next_service_due_on into v from equipment where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  if v <> date '2026-05-30' then
    raise exception 'PM: expected 2026-05-30 after re-service, got %', v;
  end if;
  raise notice 'ok: next_service_due_on advanced = %', v;
end $$;
-- Without an interval a manual date is left alone.
update equipment set service_interval_days = null, next_service_due_on = '2027-01-01'
where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
update equipment set last_serviced_at = now() where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
do $$
declare v date;
begin
  select next_service_due_on into v from equipment where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  if v <> date '2027-01-01' then
    raise exception 'PM: manual date was overwritten (%)', v;
  end if;
  raise notice 'ok: manual next_service_due_on preserved without an interval';
end $$;
\echo EXPECT ERROR NEXT (interval out of range)
do $$
begin
  update equipment set service_interval_days = 0 where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  raise exception 'PM: interval 0 was accepted';
exception
  when check_violation then
    raise notice 'ok: service_interval_days check enforced';
end $$;

-- ============================================================================
-- 2. Custom fields: owners shape, technicians read, tenants isolated
-- ============================================================================
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into equipment_custom_fields (company_id, key, label, field_type, options, sort_order)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'filter_size', 'Filter size', 'select', '["16x20","20x25"]', 1);
insert into equipment_custom_fields (company_id, key, label, field_type)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'asset_tag', 'Asset tag', 'text');
select key, label, field_type from equipment_custom_fields order by sort_order, created_at;
\echo EXPECT ERROR NEXT (bad key)
do $$
begin
  insert into equipment_custom_fields (company_id, key, label) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Bad Key', 'x');
  raise exception 'custom fields: bad key accepted';
exception
  when check_violation then
    raise notice 'ok: custom field key slug check enforced';
end $$;
-- Cross-tenant insert must be refused by RLS.
do $$
begin
  insert into equipment_custom_fields (company_id, key, label) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'sneaky', 'x');
  raise exception 'TENANT LEAK: owner A created a custom field for company B';
exception
  when insufficient_privilege then
    raise notice 'ok: cross-tenant custom field insert refused';
end $$;
update equipment set custom_fields = '{"filter_size":"16x20","asset_tag":"A-1"}'
where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
select custom_fields from equipment where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
reset role;
reset request.jwt.claim.sub;

-- A technician of company A can read but not write definitions.
insert into auth.users (id, email) values ('33333333-3333-3333-3333-333333333333','tech@x.test');
insert into profiles (id,company_id,full_name,role) values ('33333333-3333-3333-3333-333333333333','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Tech','technician');
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select count(*) as tech_sees_fields from equipment_custom_fields;
do $$
begin
  insert into equipment_custom_fields (company_id, key, label) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'tech_field', 'x');
  raise exception 'custom fields: technician could create a definition';
exception
  when insufficient_privilege then
    raise notice 'ok: technician cannot create custom field definitions';
end $$;
reset role;
reset request.jwt.claim.sub;

-- ============================================================================
-- 3. Two-way messaging: anon reply via the public token
-- ============================================================================
select public_token as pt from service_requests where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' order by created_at limit 1 \gset
-- psql variables aren't expanded inside dollar-quoted DO bodies; stash the
-- token in a session setting those blocks can read back.
select set_config('smoke.pt', :'pt', false);
set role anon;
select (add_request_customer_message(:'pt', '  Still making the noise. ')) ->> 'equipment_name' as msg_equipment;
do $$
declare v text;
begin
  select (add_request_customer_message(current_setting('smoke.pt'), 'probe'))->>'company_notification_email' into v;
  if v is not null then
    raise exception 'LEAK: anon got company_notification_email from add_request_customer_message';
  end if;
  raise notice 'ok: anon reply does not expose the notification inbox';
end $$;
\echo EXPECT ERROR NEXT (empty body)
do $$
begin
  perform add_request_customer_message(current_setting('smoke.pt'), '   ');
  raise exception 'messaging: empty body accepted';
exception
  when others then
    if sqlerrm like 'messaging:%' then raise; end if;
    raise notice 'ok: empty message rejected (%)', sqlerrm;
end $$;
do $$
begin
  perform add_request_customer_message('bogus-token', 'hi');
  raise exception 'messaging: unknown token accepted';
exception
  when others then
    if sqlerrm like 'messaging:%' then raise; end if;
    raise notice 'ok: unknown token rejected (%)', sqlerrm;
end $$;
-- The reply shows up on the public status page as a customer message.
select count(*) as customer_msgs_on_status_page
from json_array_elements((get_request_status(:'pt'))->'activity') a
where a->>'author_kind' = 'customer' and a->>'kind' = 'message';
reset role;
select last_customer_message_at is not null as stamped from service_requests where public_token = :'pt';
-- Service role gets the inbox (for the staff notification email).
set role service_role;
set request.jwt.claim.role = 'service_role';
select (add_request_customer_message(:'pt', 'from server'))->>'company_notification_email' as inbox_for_service_role;
reset request.jwt.claim.role;
reset role;
-- Canceled requests refuse replies.
update service_requests set status = 'canceled' where public_token = :'pt';
set role anon;
do $$
begin
  perform add_request_customer_message(current_setting('smoke.pt'), 'anyone there?');
  raise exception 'messaging: reply on canceled request accepted';
exception
  when others then
    if sqlerrm like 'messaging:%' then raise; end if;
    raise notice 'ok: canceled request refuses replies (%)', sqlerrm;
end $$;
reset role;

-- ============================================================================
-- 4. Webhooks: outbox fan-out, leasing, retry/disable bookkeeping
-- ============================================================================
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into webhook_endpoints (id, company_id, url, secret, events)
values ('aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'https://example.com/hook', 'whsec_test', '{}');
insert into webhook_endpoints (id, company_id, url, secret, events)
values ('aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'https://example.com/only-notes', 'whsec_test2', '{equipment.note_added}');
\echo EXPECT ERROR NEXT (http url)
do $$
begin
  insert into webhook_endpoints (company_id, url, secret) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'http://insecure.example', 's');
  raise exception 'webhooks: http:// url accepted';
exception
  when check_violation then
    raise notice 'ok: webhook urls must be https';
end $$;
-- A staff timeline note fans out to both endpoints (one wants everything, one wants notes).
insert into equipment_events (company_id, equipment_id, kind, summary, actor_kind, actor_user_id)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'note', 'Checked belts', 'staff', auth.uid());
-- A status change fans out to the catch-all endpoint only.
insert into equipment_events (company_id, equipment_id, kind, summary, actor_kind)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'status_changed', 'Status: Active → Needs service', 'staff');
-- An internal note on a request must NOT leave the tenant.
insert into request_activity (company_id, service_request_id, kind, visibility, body, author_user_id)
select company_id, id, 'note', 'internal', 'secret internal note', auth.uid()
from service_requests where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' limit 1;
-- A customer-visible one does.
insert into request_activity (company_id, service_request_id, kind, visibility, body, author_user_id)
select company_id, id, 'note', 'customer', 'On our way', auth.uid()
from service_requests where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' limit 1;
select event_type, count(*) from webhook_deliveries group by event_type order by event_type;
do $$
declare v int;
begin
  select count(*) into v from webhook_deliveries where payload::text like '%secret internal note%';
  if v <> 0 then
    raise exception 'LEAK: internal note reached the webhook outbox';
  end if;
  select count(*) into v from webhook_deliveries where event_type = 'equipment.note_added';
  if v <> 2 then
    raise exception 'webhooks: expected 2 note deliveries (both endpoints), got %', v;
  end if;
  select count(*) into v from webhook_deliveries where event_type = 'equipment.status_changed';
  if v <> 1 then
    raise exception 'webhooks: expected 1 status_changed delivery (catch-all only), got %', v;
  end if;
  raise notice 'ok: outbox fan-out respects event filters and visibility';
end $$;
-- Test event via the owner RPC.
select enqueue_webhook_test('aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaaa') is not null as test_enqueued;
-- Owners can see their delivery log but not write it.
select count(*) > 0 as owner_sees_log from webhook_deliveries;
do $$
begin
  update webhook_deliveries set status = 'delivered';
  if found then
    raise exception 'webhooks: staff could update the delivery log';
  end if;
  raise notice 'ok: delivery log is read-only for staff';
end $$;
reset role;
reset request.jwt.claim.sub;

-- The worker leases, then records outcomes.
set role service_role;
select count(*) as leased from claim_webhook_deliveries(10);
select count(*) as nothing_left_to_lease from claim_webhook_deliveries(10);
select id as d1 from webhook_deliveries where endpoint_id = 'aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaaa' order by created_at limit 1 \gset
select finish_webhook_delivery(:'d1', 200);
select status, response_status, delivered_at is not null as delivered from webhook_deliveries where id = :'d1';
select id as d2 from webhook_deliveries where endpoint_id = 'aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaaa' order by created_at limit 1 \gset
select finish_webhook_delivery(:'d2', 500, 'Internal Server Error');
select status, attempts, response_status, next_attempt_at > now() as backed_off from webhook_deliveries where id = :'d2';
select failure_count, is_active from webhook_endpoints where id = 'aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
-- Exhaust retries: after 5 attempts the delivery is failed.
update webhook_deliveries set attempts = 5 where id = :'d2';
select finish_webhook_delivery(:'d2', null, 'timeout');
select status as after_max_attempts from webhook_deliveries where id = :'d2';
-- 20 consecutive failures disable the endpoint.
update webhook_endpoints set failure_count = 19 where id = 'aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
update webhook_deliveries set attempts = 1 where id = :'d2';
select finish_webhook_delivery(:'d2', 503, 'Service Unavailable');
select is_active, disabled_at is not null as disabled from webhook_endpoints where id = 'aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select prune_webhook_deliveries() as pruned_now;
reset role;

-- Company B's owner sees none of A's endpoints or deliveries.
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
declare v int;
begin
  select count(*) into v from webhook_endpoints;
  if v <> 0 then raise exception 'TENANT LEAK: owner B sees % of A''s webhook endpoints', v; end if;
  select count(*) into v from webhook_deliveries;
  if v <> 0 then raise exception 'TENANT LEAK: owner B sees % of A''s webhook deliveries', v; end if;
  select count(*) into v from equipment_custom_fields;
  if v <> 0 then raise exception 'TENANT LEAK: owner B sees % of A''s custom fields', v; end if;
  raise notice 'ok: webhook + custom field tables are tenant-isolated';
end $$;
do $$
begin
  perform enqueue_webhook_test('aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  raise exception 'TENANT LEAK: owner B queued a test at A''s endpoint';
exception
  when others then
    if sqlerrm like 'TENANT LEAK%' then raise; end if;
    raise notice 'ok: enqueue_webhook_test on A''s endpoint raised "%"', sqlerrm;
end $$;
reset role;
reset request.jwt.claim.sub;

-- anon can't touch the worker RPCs.
set role anon;
do $$
begin
  perform claim_webhook_deliveries(1);
  raise exception 'LEAK: anon may call claim_webhook_deliveries()';
exception
  when insufficient_privilege then
    raise notice 'ok: claim_webhook_deliveries denied to anon';
end $$;
reset role;
\echo smoke-next: all assertions passed

-- ============================================================================
-- 5. get_request_status carries the company timezone and the reply flag
-- ============================================================================
set role anon;
select (get_request_status(current_setting('smoke.pt')))->>'company_timezone' as tz,
       (get_request_status(current_setting('smoke.pt')))->>'can_reply' as can_reply_when_canceled;
reset role;
\echo smoke-next: all assertions passed (incl. §5)
