-- 0022_equipment_custom_fields_scan.sql
--
-- Custom fields on the public scan page. 0019 added `show_on_scan_page` to
-- equipment_custom_fields as a stored preference; this makes resolve_qr_code()
-- honour it. The equipment object in the guide gains one key:
--
--   custom_fields: [{ label, value }, ...]
--
-- One entry per definition that is flagged show_on_scan_page AND has a
-- non-null value on the unit, in the owner's sort order. Values are rendered
-- as text here (booleans as "Yes"/"No") so the page never has to know the
-- field type. Definitions that are not flagged — the default — never leave
-- the tenant, and neither do keys, ids or help text.
--
-- The rest of the function body is the 0013 §11a version verbatim. Grants
-- are untouched: `create or replace` keeps the existing anon/authenticated
-- execute privileges.

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

  -- Retired with no unit behind it any more (unit deleted, or the code was
  -- retired without a replacement): tell the customer to contact the company.
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
      'brand_color', c.brand_color
    ),
    'equipment_type', json_build_object('id', et.id, 'name', et.name, 'description', et.description),
    'code', json_build_object(
      'short_code', v_code.short_code,
      'status', v_code.status
    ),
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
