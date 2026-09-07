-- 0023_public_company_timezone.sql
--
-- The public status page (/r/<token>) and the scan page's "Already reported"
-- card render a scheduled visit's time. Both are anonymous, so the only
-- company data they have is what the public RPCs return — and neither RPC
-- carried the company timezone, so the pages fell back to the server's
-- clock (UTC on Vercel) and showed "3:00 PM" for a 10:00 AM Chicago visit.
--
-- Additive: both functions are re-created with their 0021 / 0022 bodies plus
-- one extra key, `company.timezone`. Grants are unchanged.

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
      'brand_color', c.brand_color,
      'timezone', c.timezone
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

create or replace function resolve_qr_code(p_token text)
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_code qr_codes;
  v_guide json;
begin
  v_code := find_qr_code(p_token);

  if v_code.id is null then
    return json_build_object('status', 'not_found');
  end if;

  if v_code.equipment_id is null and v_code.status <> 'active' then
    return json_build_object(
      'status', 'retired',
      'company_id', v_code.company_id
    );
  end if;

  if v_code.equipment_id is null then
    return json_build_object(
      'status', 'unclaimed',
      'company_id', v_code.company_id
    );
  end if;

  select json_build_object(
    'equipment', json_build_object(
      'id', e.id,
      'name', e.name,
      'make', e.make,
      'model', e.model,
      'location', e.location,
      'status', e.status,
      'photo_path', e.photo_path,
      'last_serviced_at', e.last_serviced_at,
      'next_service_due_on', e.next_service_due_on,
      -- Owner-defined fields flagged for the scan page, with a value, in
      -- the owner's order. Labels + text only: no keys, ids or help text.
      'custom_fields', coalesce((
        select json_agg(json_build_object(
          'label', cf.label,
          'value', case
            when cf.field_type = 'boolean' then
              case when (e.custom_fields -> cf.key)::text in ('true', '"true"') then 'Yes' else 'No' end
            else e.custom_fields ->> cf.key
          end
        ) order by cf.sort_order, cf.created_at)
        from equipment_custom_fields cf
        where cf.company_id = e.company_id
          and cf.show_on_scan_page
          and e.custom_fields ? cf.key
          and jsonb_typeof(e.custom_fields -> cf.key) <> 'null'
          and (e.custom_fields ->> cf.key) <> ''
      ), '[]'::json)
    ),
    'company', json_build_object(
      'id', c.id,
      'name', c.name,
      'phone', c.phone,
      'sms_number', c.sms_number,
      'website', c.website,
      'logo_path', c.logo_path,
      'brand_color', c.brand_color,
      'timezone', c.timezone
    ),
    'equipment_type', json_build_object('id', et.id, 'name', et.name, 'description', et.description),
    'code', json_build_object(
      'short_code', v_code.short_code,
      'status', v_code.status
    ),
    'open_requests', coalesce((
      select json_agg(json_build_object(
        'id', sr.id,
        'public_token', sr.public_token,
        'status', sr.status,
        'priority', sr.priority,
        'description', left(sr.description, 280),
        'contact_first_name', split_part(btrim(sr.contact_name), ' ', 1),
        'created_at', sr.created_at,
        'status_updated_at', sr.status_updated_at,
        'scheduled_for', sr.scheduled_for,
        'assigned_to_name', (select split_part(btrim(p.full_name), ' ', 1) from profiles p where p.id = sr.assigned_to),
        'update_count', (select count(*) from request_activity ra
                           where ra.service_request_id = sr.id and ra.visibility = 'customer')
      ) order by sr.created_at desc)
      from (
        select * from service_requests
        where equipment_id = e.id
          and status in ('new', 'in_progress', 'scheduled', 'on_hold')
        order by created_at desc
        limit 5
      ) sr
    ), '[]'::json),
    'root_step_id', (select id from guide_steps where equipment_type_id = et.id and is_root limit 1),
    'steps', coalesce((
      select json_agg(json_build_object(
        'id', gs.id,
        'title', gs.title,
        'instructions', gs.instructions,
        'media_url', gs.media_url,
        'is_root', gs.is_root,
        'options', coalesce((
          select json_agg(json_build_object(
            'id', go.id,
            'label', go.label,
            'outcome', go.outcome,
            'next_step_id', go.next_step_id
          ) order by go.sort_order)
          from guide_options go
          where go.guide_step_id = gs.id
        ), '[]'::json)
      ))
      from guide_steps gs
      where gs.equipment_type_id = et.id
    ), '[]'::json)
  )
  into v_guide
  from equipment e
  join companies c on c.id = e.company_id
  join equipment_types et on et.id = e.equipment_type_id
  where e.id = v_code.equipment_id;

  return json_build_object('status', 'claimed', 'guide', v_guide);
end;
$$;

revoke execute on function resolve_qr_code(text) from public;
grant execute on function resolve_qr_code(text) to anon, authenticated;
