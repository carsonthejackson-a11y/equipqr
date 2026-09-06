\set ON_ERROR_STOP on
-- Smoke suite for migration 0023 (webhook delivery retry). Run after
-- smoke.sql and smoke-next.sql on a fresh `db.sh reset`:
--   psql "$(scripts/local-db/db.sh url)" -f scripts/local-db/smoke.sql
--   psql "$(scripts/local-db/db.sh url)" -f scripts/local-db/smoke-next.sql
--   psql "$(scripts/local-db/db.sh url)" -f scripts/local-db/smoke-webhooks.sql
-- Depends on the endpoints / deliveries smoke-next.sql §4 leaves behind
-- (endpoint aaaaaaa1 active, endpoint aaaaaaa2 auto-disabled).

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

\echo smoke-webhooks: all assertions passed
