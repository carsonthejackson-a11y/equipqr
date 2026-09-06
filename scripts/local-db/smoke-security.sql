\set ON_ERROR_STOP on
-- Smoke suite for migration 0025 (Next security hardening). Run after
-- smoke.sql (+ ideally smoke-next.sql) on a fresh `db.sh reset`. Depends on
-- companies A (owner 1111…) and B (owner 2222…, unit bbbbbbb1, request
-- bbbbbbb3) that smoke.sql seeds, and company A's request(s).

reset role;
reset request.jwt.claim.sub;

-- Company A needs an active endpoint so the fan-out triggers actually run.
insert into webhook_endpoints (id, company_id, url, secret)
values ('aaaaaaa9-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'https://example.com/a', 'whsec_a')
on conflict (id) do nothing;

-- ============================================================================
-- 1. Cross-tenant read via the outbox is closed at both layers
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
-- 2. Replies close 14 days after resolution
-- ============================================================================
select public_token as pt from service_requests
where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and status <> 'canceled'
order by created_at desc limit 1 \gset
select set_config('smoke.pt2', :'pt', false);
update service_requests set status = 'resolved', resolution_summary = 'done' where public_token = :'pt';
set role anon;
select (get_request_status(current_setting('smoke.pt2')))->>'can_reply' as can_reply_fresh_resolved;
select (add_request_customer_message(current_setting('smoke.pt2'), 'still ok?'))->>'status' as reply_on_fresh_resolved;
reset role;
update service_requests set resolved_at = now() - interval '15 days' where public_token = :'pt';
set role anon;
select (get_request_status(current_setting('smoke.pt2')))->>'can_reply' as can_reply_old_resolved;
do $$
begin
  perform add_request_customer_message(current_setting('smoke.pt2'), 'anyone?');
  raise exception 'messaging: reply on a 15-day-old resolved request accepted';
exception
  when others then
    if sqlerrm like 'messaging:%' then raise; end if;
    raise notice 'ok: old resolved request refuses replies (%)', sqlerrm;
end $$;
reset role;

-- ============================================================================
-- 3. Endpoint cap enforced by the DB
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
-- 5. The secret is not readable by staff
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
-- 4. Fair leasing and hand-back
-- ============================================================================
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
\echo smoke-security: all assertions passed
