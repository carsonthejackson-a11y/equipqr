-- 0021_messaging_activity_metadata.sql
--
-- Two-way messaging (workstream B): the public /r/<token> status page needs
-- to show WHO wrote each customer message, not just its body. That name
-- lives in request_activity.metadata->>'author_name' (written by
-- add_customer_request_update(), migration 0019) but get_request_status()
-- (last redefined in 0015) doesn't expose it. This recreates the function
-- with the SAME signature (so 0015's grants still apply) and adds exactly
-- one field to each activity row in the json payload.
--
-- Purely additive — copy of the 0015 definition plus one extra key.

create or replace function get_request_status(p_public_token text)
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_result json;
begin
  select json_build_object(
    'status', sr.status,
    'priority', sr.priority,
    'created_at', sr.created_at,
    'status_updated_at', sr.status_updated_at,
    'scheduled_for', sr.scheduled_for,
    'resolved_at', sr.resolved_at,
    'resolution_summary', sr.resolution_summary,
    'resolution_recommendations', sr.resolution_recommendations,
    'contact_name', sr.contact_name,
    'description', sr.description,
    'equipment', json_build_object('name', e.name, 'location', e.location),
    'company', json_build_object(
      'id', c.id,
      'name', c.name,
      'phone', c.phone,
      'sms_number', c.sms_number,
      'logo_path', c.logo_path,
      'brand_color', c.brand_color
    ),
    'assigned_to_name', (select p.full_name from profiles p where p.id = sr.assigned_to),
    'activity', coalesce((
      select json_agg(json_build_object(
        'kind', ra.kind,
        'body', ra.body,
        'author_kind', ra.author_kind,
        'created_at', ra.created_at,
        -- Two-way messaging (0019/0021): the name a customer typed into the
        -- message composer, so a second reply on the same request shows who
        -- said what. Staff/system rows never set this key.
        'author_name', ra.metadata->>'author_name'
      ) order by ra.created_at)
      from request_activity ra
      where ra.service_request_id = sr.id and ra.visibility = 'customer'
    ), '[]'::json)
  )
  into v_result
  from service_requests sr
  join equipment e on e.id = sr.equipment_id
  join companies c on c.id = sr.company_id
  where sr.public_token = p_public_token;

  return v_result; -- null when the token is unknown
end;
$$;

revoke execute on function get_request_status(text) from public;
grant execute on function get_request_status(text) to anon, authenticated;
