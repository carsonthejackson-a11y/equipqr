\set ON_ERROR_STOP on
-- Smoke suite for migration 0022 (custom fields + outbound webhooks +
-- insert-policy hardening). Run after smoke.sql on a fresh `db.sh reset`
-- (NOT after smoke-next.sql, which seeds its own overlapping fixtures):
--   psql "$(scripts/local-db/db.sh url)" -f scripts/local-db/smoke.sql
--   psql "$(scripts/local-db/db.sh url)" -f scripts/local-db/smoke-port.sql
-- Depends on companies A (owner 1111…) and B (owner 2222…, unit bbbbbbb1,
-- request bbbbbbb3) that smoke.sql seeds.

-- ============================================================================
-- 1. Custom fields: owners shape, technicians read, tenants isolated
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

-- ============================================================================
-- 1. resolve_qr_code(): only show_on_scan_page fields with a value leak out
-- ============================================================================
-- Nothing is flagged yet: the array is present and empty.
set role anon;
do $$
declare v json;
begin
  v := (resolve_qr_code('0123456789abcdef01234567'))->'guide'->'equipment'->'custom_fields';
  if v is null then
    raise exception 'scan: custom_fields key missing from the guide';
  end if;
  if json_array_length(v) <> 0 then
    raise exception 'LEAK: % custom field(s) shown on scan page with none flagged', json_array_length(v);
  end if;
  raise notice 'ok: no custom fields shown when none are flagged';
end $$;
reset role;

-- Flag filter_size, add a boolean and a flagged-but-empty field.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update equipment_custom_fields set show_on_scan_page = true
where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and key = 'filter_size';
insert into equipment_custom_fields (company_id, key, label, field_type, show_on_scan_page, sort_order)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'has_drain_pan', 'Has drain pan', 'boolean', true, 0),
       ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'voltage', 'Voltage', 'number', true, 5);
update equipment
set custom_fields = '{"filter_size":"16x20","asset_tag":"A-1","has_drain_pan":true,"voltage":null}'
where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
reset role;
reset request.jwt.claim.sub;

set role anon;
select json_array_elements((resolve_qr_code('0123456789abcdef01234567'))->'guide'->'equipment'->'custom_fields') as shown;
do $$
declare
  v json;
  v_text text;
begin
  v := (resolve_qr_code('0123456789abcdef01234567'))->'guide'->'equipment'->'custom_fields';
  v_text := v::text;
  -- Sort order: has_drain_pan (0) before filter_size (1); voltage (null) absent.
  if json_array_length(v) <> 2 then
    raise exception 'scan: expected 2 custom fields, got % (%)', json_array_length(v), v_text;
  end if;
  if (v->0->>'label') <> 'Has drain pan' or (v->0->>'value') <> 'Yes' then
    raise exception 'scan: first field should be "Has drain pan: Yes", got %', v->0;
  end if;
  if (v->1->>'label') <> 'Filter size' or (v->1->>'value') <> '16x20' then
    raise exception 'scan: second field should be "Filter size: 16x20", got %', v->1;
  end if;
  if v_text like '%asset_tag%' or v_text like '%A-1%' then
    raise exception 'LEAK: unflagged custom field reached the scan page (%)', v_text;
  end if;
  if v_text like '%"key"%' or v_text like '%help_text%' then
    raise exception 'LEAK: custom field internals reached the scan page (%)', v_text;
  end if;
  raise notice 'ok: scan page shows flagged fields only, in order, booleans as Yes/No';
end $$;
reset role;

-- The rest of the guide is unchanged by 0022.
set role anon;
select (resolve_qr_code('0123456789abcdef01234567'))->>'status' as still_claimed,
       (resolve_qr_code('0123456789abcdef01234567'))->'guide'->'code'->>'status' as code_status,
       json_array_length((resolve_qr_code('0123456789abcdef01234567'))->'guide'->'steps') as steps;
reset role;

-- ============================================================================
-- 3. Webhooks: outbox fan-out, leasing, retry/disable bookkeeping
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

-- ============================================================================
-- 4. Retry RPC
-- ============================================================================
reset role;
reset request.jwt.claim.sub;

-- Arrange: one exhausted delivery on the active endpoint, one on the
-- disabled endpoint, and one that was delivered fine.
update webhook_deliveries set status = 'failed', attempts = 5, last_error = 'HTTP 500', next_attempt_at = now() + interval '2 hours'
where id = (select id from webhook_deliveries where endpoint_id = 'aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and status <> 'delivered' order by created_at limit 1);
select id as failed_active from webhook_deliveries where endpoint_id = 'aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and status = 'failed' order by created_at limit 1 \gset
update webhook_deliveries set status = 'failed', attempts = 5
where id = (select id from webhook_deliveries where endpoint_id = 'aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaaa' order by created_at limit 1);
select id as failed_disabled from webhook_deliveries where endpoint_id = 'aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and status = 'failed' order by created_at limit 1 \gset
select id as delivered_one from webhook_deliveries where status = 'delivered' order by created_at limit 1 \gset

-- Owner A retries the failed delivery on the active endpoint: back to the queue with a fresh budget.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select retry_webhook_delivery(:'failed_active') as retried;
select status, attempts, next_attempt_at <= now() as due_now, last_error from webhook_deliveries where id = :'failed_active';
do $$
declare v_status text; v_attempts int; v_due boolean;
begin
  select status, attempts, next_attempt_at <= now() into v_status, v_attempts, v_due
  from webhook_deliveries
  where endpoint_id = 'aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and attempts = 0 and status = 'pending'
  order by created_at limit 1;
  if v_status is distinct from 'pending' or v_attempts <> 0 or not v_due then
    raise exception 'retry: expected pending/0 attempts/due now, got %/%/%', v_status, v_attempts, v_due;
  end if;
  raise notice 'ok: retry_webhook_delivery re-queued the failed delivery';
end $$;
-- A delivered row is a no-op (returns false, nothing changes).
select retry_webhook_delivery(:'delivered_one') as retried_delivered_noop;
do $$
declare v text;
begin
  select status into v from webhook_deliveries where status = 'delivered' limit 1;
  if v is distinct from 'delivered' then
    raise exception 'retry: a delivered row was modified';
  end if;
  raise notice 'ok: retrying a delivered row is a no-op';
end $$;
-- A failed row on a disabled endpoint is refused with a clear message.
do $$
begin
  perform retry_webhook_delivery((select id from webhook_deliveries where endpoint_id = 'aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and status = 'failed' limit 1));
  raise exception 'retry: delivery on a disabled endpoint was re-queued';
exception
  when others then
    if sqlerrm like 'retry:%' then raise; end if;
    raise notice 'ok: retry on a disabled endpoint raised "%"', sqlerrm;
end $$;
reset role;
reset request.jwt.claim.sub;

-- Owner B (other company) can't retry A's deliveries — same error as "not found".
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
begin
  perform retry_webhook_delivery((select id from webhook_deliveries where endpoint_id = 'aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaaa' limit 1));
  raise exception 'TENANT LEAK: owner B retried one of A''s deliveries';
exception
  when others then
    if sqlerrm like 'TENANT LEAK%' then raise; end if;
    raise notice 'ok: retry_webhook_delivery on A''s delivery raised "%" for B', sqlerrm;
end $$;
reset role;
reset request.jwt.claim.sub;

-- anon can't call it at all.
set role anon;
do $$
begin
  perform retry_webhook_delivery(gen_random_uuid());
  raise exception 'LEAK: anon may call retry_webhook_delivery()';
exception
  when insufficient_privilege then
    raise notice 'ok: retry_webhook_delivery denied to anon';
end $$;
reset role;

-- ============================================================================
-- 5. Cross-tenant read via the outbox is closed at both layers
-- ============================================================================
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

-- (a) The insert policy refuses an event that points at B's unit …
do $$
begin
  insert into equipment_events (company_id, equipment_id, kind, summary, actor_kind)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbb1-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'note', 'probe', 'staff');
  raise exception 'TENANT LEAK: owner A inserted an event against company B''s unit';
exception
  when insufficient_privilege then
    raise notice 'ok: equipment_events insert against a foreign unit refused';
end $$;

-- … or at B's request through service_request_id …
do $$
begin
  insert into equipment_events (company_id, equipment_id, kind, summary, service_request_id, actor_kind)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'note', 'probe',
          'bbbbbbb3-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'staff');
  raise exception 'TENANT LEAK: owner A inserted an event referencing company B''s request';
exception
  when insufficient_privilege then
    raise notice 'ok: equipment_events insert referencing a foreign request refused';
end $$;

-- … and the same for request_activity.
do $$
begin
  insert into request_activity (company_id, service_request_id, kind, visibility, body, author_user_id)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbb3-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'status_change', 'customer', 'probe', auth.uid());
  raise exception 'TENANT LEAK: owner A inserted activity on company B''s request';
exception
  when insufficient_privilege then
    raise notice 'ok: request_activity insert on a foreign request refused';
end $$;

-- Legitimate inserts still work.
insert into equipment_events (company_id, equipment_id, kind, summary, actor_kind, actor_user_id)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'note', 'legit', 'staff', auth.uid());
insert into request_activity (company_id, service_request_id, kind, visibility, body, author_user_id)
select company_id, id, 'note', 'customer', 'legit', auth.uid()
from service_requests where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' limit 1;
reset role;
reset request.jwt.claim.sub;

-- (b) Even if a cross-tenant row got in (simulated as superuser, bypassing
-- RLS), the trigger serialises nothing from the other tenant.
insert into equipment_events (company_id, equipment_id, kind, summary, actor_kind)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbb1-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'note', 'superuser probe', 'system');
insert into request_activity (company_id, service_request_id, kind, visibility, body, author_kind)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbb3-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'status_change', 'customer', 'superuser probe', 'system');
do $$
declare v int;
begin
  select count(*) into v from webhook_deliveries
  where payload::text like '%Mahlkonig%' or payload::text like '%Bea%' or payload::text like '%superuser probe%';
  if v <> 0 then
    raise exception 'TENANT LEAK: % outbox row(s) carry company B data', v;
  end if;
  raise notice 'ok: fan-out triggers never serialise a foreign parent row';
end $$;
-- Clean up the simulated rows so later suites see a sane timeline.
delete from equipment_events where summary = 'superuser probe';
delete from request_activity where body = 'superuser probe';

-- ============================================================================
-- 6. Endpoint cap enforced by the DB
-- ============================================================================
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
insert into webhook_endpoints (company_id, url, secret)
select 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'https://example.com/b/' || g, 'whsec_b' || g
from generate_series(1, 10) g;
do $$
begin
  insert into webhook_endpoints (company_id, url, secret) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'https://example.com/b/11', 'whsec_b11');
  raise exception 'webhooks: 11th active endpoint accepted';
exception
  when others then
    if sqlerrm like 'webhooks:%' then raise; end if;
    raise notice 'ok: endpoint cap enforced (%)', sqlerrm;
end $$;
-- Disabled ones don't count; re-enabling past the cap is refused.
update webhook_endpoints set is_active = false where company_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' and url like '%/b/1';
insert into webhook_endpoints (company_id, url, secret) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'https://example.com/b/12', 'whsec_b12');
do $$
begin
  update webhook_endpoints set is_active = true where company_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' and url like '%/b/1';
  raise exception 'webhooks: re-enabling past the cap accepted';
exception
  when others then
    if sqlerrm like 'webhooks:%' then raise; end if;
    raise notice 'ok: re-enable past the cap refused (%)', sqlerrm;
end $$;

-- ============================================================================
-- 7. The secret is not readable by staff
-- ============================================================================
select count(*) as b_endpoints_visible from webhook_endpoints;
do $$
declare v text;
begin
  select secret into v from webhook_endpoints limit 1;
  raise exception 'LEAK: owner could read webhook_endpoints.secret';
exception
  when insufficient_privilege then
    raise notice 'ok: webhook_endpoints.secret is not selectable by staff';
end $$;
-- Owners can still write it (create + rotate).
update webhook_endpoints set secret = 'whsec_rotated' where url like '%/b/2';
reset role;
reset request.jwt.claim.sub;

-- ============================================================================

-- ============================================================================
-- 8. Fair leasing and hand-back
-- ============================================================================
reset role;
reset request.jwt.claim.sub;
insert into webhook_endpoints (id, company_id, url, secret)
values ('aaaaaaa9-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'https://example.com/a', 'whsec_a')
on conflict (id) do nothing;
set role service_role;
-- 40 pending rows on one endpoint, 3 on another: a claim of 50 takes at most 25 of the first.
insert into webhook_deliveries (company_id, endpoint_id, event_type, payload)
select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaa9-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'webhook.test', '{"x":1}'::jsonb
from generate_series(1, 40);
insert into webhook_endpoints (id, company_id, url, secret)
values ('aaaaaaa8-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'https://example.com/a2', 'whsec_a2');
insert into webhook_deliveries (company_id, endpoint_id, event_type, payload)
select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaa8-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'webhook.test', '{"y":1}'::jsonb
from generate_series(1, 3);
update webhook_deliveries set status = 'delivered' where endpoint_id not in ('aaaaaaa9-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaa8-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
create temp table leased as select * from claim_webhook_deliveries(50, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
do $$
declare v_big int; v_small int;
begin
  select count(*) into v_big from leased where endpoint_id = 'aaaaaaa9-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  select count(*) into v_small from leased where endpoint_id = 'aaaaaaa8-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if v_big <> 25 or v_small <> 3 then
    raise exception 'webhooks: expected 25 + 3 leased, got % + %', v_big, v_small;
  end if;
  raise notice 'ok: claim caps each endpoint at 25 rows (% + %)', v_big, v_small;
end $$;
-- Hand back: attempts refunded, due now.
select release_webhook_deliveries(array(select id from leased)) as released;
do $$
declare v int;
begin
  select count(*) into v from webhook_deliveries d join leased l on l.id = d.id
  where d.attempts <> 0 or d.next_attempt_at > now();
  if v <> 0 then raise exception 'webhooks: % released rows still carry an attempt / future lease', v; end if;
  raise notice 'ok: release_webhook_deliveries refunds the attempt';
end $$;
reset role;

set role anon;
do $$
begin
  perform release_webhook_deliveries(array[gen_random_uuid()]);
  raise exception 'LEAK: anon may call release_webhook_deliveries()';
exception
  when insufficient_privilege then
    raise notice 'ok: release_webhook_deliveries denied to anon';
end $$;
reset role;

-- 6. claim_webhook_delivery leases exactly one row, once.
set role service_role;
select id as one_id from webhook_deliveries where status = 'pending' order by created_at limit 1 \gset
select count(*) as leased_one from claim_webhook_delivery(:'one_id');
select count(*) as leased_again from claim_webhook_delivery(:'one_id');
select count(*) as leased_bogus from claim_webhook_delivery(gen_random_uuid());
reset role;
\echo smoke-port: all assertions passed
