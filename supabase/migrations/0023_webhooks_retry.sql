-- 0023_webhooks_retry.sql
--
-- Outbound webhooks (workstream W): lets an owner re-queue a delivery that
-- exhausted its retries, from the "Recent deliveries" list on
-- Settings → API → Webhooks.
--
-- Why an RPC: 0019 deliberately gives staff NO update policy on
-- webhook_deliveries (the outbox is written by triggers and the service
-- role only), so "Retry" needs a narrow security-definer function that does
-- the ownership check itself. Only `failed` rows can be retried — pending
-- rows are already scheduled and delivered ones are done. The row goes back
-- to the front of the queue with a fresh attempt budget; the deliverer
-- (src/lib/webhooks.ts) then picks it up on the next after() flush or cron
-- run. Additive; nothing from 0019 changes.

create or replace function retry_webhook_delivery(p_delivery_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery webhook_deliveries;
begin
  select * into v_delivery
  from webhook_deliveries
  where id = p_delivery_id
    and company_id = get_my_company_id();

  if v_delivery.id is null or not is_company_owner() then
    raise exception 'Webhook delivery not found';
  end if;

  if v_delivery.status <> 'failed' then
    -- Pending rows are already queued; delivered rows are done. Nothing to do.
    return false;
  end if;

  -- The endpoint must be able to receive it, or the retry would just fail
  -- again with "Endpoint is disabled" and count against its health.
  if not exists (select 1 from webhook_endpoints where id = v_delivery.endpoint_id and is_active) then
    raise exception 'Enable the endpoint before retrying deliveries to it';
  end if;

  update webhook_deliveries
  set status = 'pending',
      attempts = 0,
      next_attempt_at = now()
  where id = p_delivery_id;

  return true;
end;
$$;

revoke execute on function retry_webhook_delivery(uuid) from public, anon;
grant execute on function retry_webhook_delivery(uuid) to authenticated;
