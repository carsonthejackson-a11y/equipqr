-- 0031_vendor_acknowledge_keeps_eta.sql
--
-- Bug: vendor_acknowledge_dispatch() (0025 §4b) sets `status =
-- 'acknowledged'` unconditionally. A vendor who had already given an ETA
-- (status eta_given, eta_at set — vendor_set_dispatch_eta also stamps
-- acknowledged_at) and then tapped "Acknowledge" on /v/<token> was moved
-- BACK to acknowledged: the dispatch card, the request's trigger-synced
-- dispatch_status and the SLA views all stopped showing the ETA state even
-- though eta_at was still on the row (reproduced on the local harness).
--
-- Fix: re-created with the 0025 body verbatim except that the status only
-- moves forward — an eta_given dispatch stays eta_given. Everything else
-- (acknowledged_at, the note append, the activity row, the request moving
-- new -> in_progress, the rate limit, the grants) is unchanged.
--
-- No enum changes, so this runs inside a single transaction.

create or replace function vendor_acknowledge_dispatch(p_token text, p_note text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dispatch dispatches;
  v_request service_requests;
  v_vendor vendors;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_result json;
begin
  select * into v_dispatch from dispatches where token = p_token;
  if v_dispatch.id is null then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;

  select * into v_request from service_requests where id = v_dispatch.service_request_id;

  if v_dispatch.status = 'declined' or v_request.status in ('resolved', 'canceled') then
    raise exception 'This request is closed' using errcode = 'P0001';
  end if;

  if not check_rate_limit('vd:' || v_dispatch.id::text, 60, 3600) then
    raise exception 'Too many requests — try again later' using errcode = '54000';
  end if;

  select * into v_vendor from vendors where id = v_dispatch.vendor_id;

  update dispatches
  -- 0031: never regress a dispatch that already carries an ETA.
  set status = case when status = 'eta_given' then status else 'acknowledged' end,
      acknowledged_at = now(),
      vendor_notes = case when v_note is not null
        then left(coalesce(vendor_notes || E'\n', '') || v_note, 8000)
        else vendor_notes end
  where id = v_dispatch.id
  returning * into v_dispatch;

  update service_requests set status = 'in_progress' where id = v_request.id and status = 'new';

  insert into request_activity (company_id, service_request_id, kind, visibility, body, author_kind, metadata)
  values (
    v_request.company_id, v_request.id, 'dispatch', 'customer',
    v_vendor.name || ' acknowledged the work order', 'vendor',
    jsonb_strip_nulls(jsonb_build_object(
      'action', 'acknowledge', 'vendor_id', v_vendor.id, 'vendor_name', v_vendor.name,
      'dispatch_id', v_dispatch.id, 'note', v_note
    ))
  );

  select json_build_object(
    'action', 'acknowledge', 'dispatch_id', v_dispatch.id, 'status', v_dispatch.status,
    'request_id', v_request.id, 'request_public_token', v_request.public_token,
    'vendor_id', v_vendor.id, 'vendor_name', v_vendor.name,
    'eta_at', v_dispatch.eta_at, 'vendor_note', v_note, 'decline_reason', null,
    'equipment_id', e.id, 'equipment_name', e.name, 'location_name', l.name,
    'company_id', c.id, 'company_name', c.name,
    'company_notification_email', case when is_service_role() then c.notification_email else null end
  )
  into v_result
  from equipment e
  join companies c on c.id = e.company_id
  left join locations l on l.id = e.location_id
  where e.id = v_request.equipment_id;

  return v_result;
end;
$$;

revoke execute on function vendor_acknowledge_dispatch(text, text) from public;
grant execute on function vendor_acknowledge_dispatch(text, text) to anon, authenticated, service_role;

comment on function vendor_acknowledge_dispatch(text, text) is
  'Anon-callable. Rate-limited per dispatch (vd:, 60/h). Moves a new request to in_progress and appends one customer-visible, vendor-authored activity row. Never moves an eta_given dispatch back to acknowledged (0031).';
