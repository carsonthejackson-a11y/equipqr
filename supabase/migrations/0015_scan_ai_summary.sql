-- ============================================================================
-- 0015. set_request_ai_summary: let the public submit route write its summary
-- ============================================================================
--
-- POST /api/service-requests runs as anon (the requester has no session). It
-- creates the request through submit_service_request() — a security-definer
-- RPC — and then generates an AI summary of the troubleshooting path. That
-- second write went straight at the table with the anon client, where RLS has
-- no policy granting anon an update on service_requests, so the summary was
-- silently dropped on every submission.
--
-- Fix: a narrow security-definer RPC. It updates exactly one row and only
-- when BOTH the id and the public_token match, so holding the route's anon
-- key is not enough to spray summaries across other companies' requests —
-- you need the unguessable token that submit_service_request() just handed
-- back for this specific request. It also refuses to overwrite a summary
-- that already exists, so the RPC can't be used to rewrite history later.

create or replace function set_request_ai_summary(
  p_request_id uuid,
  p_public_token text,
  p_summary text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int;
begin
  if p_request_id is null or p_public_token is null or coalesce(trim(p_summary), '') = '' then
    return false;
  end if;

  update service_requests
  set ai_summary = p_summary
  where id = p_request_id
    and public_token = p_public_token
    and ai_summary is null;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

comment on function set_request_ai_summary(uuid, text, text) is
  'Anon-callable from POST /api/service-requests only: sets ai_summary on the request the caller just created, proven by id + public_token.';

revoke execute on function set_request_ai_summary(uuid, text, text) from public;
grant execute on function set_request_ai_summary(uuid, text, text) to anon, authenticated;

-- ============================================================================
-- 0015b. get_request_status: expose company_id so /r/<token> can plan-gate
-- ============================================================================
--
-- Identical to the 0013 definition plus one field. The public status page
-- resolves branding with resolveBranding(), which only strips a company's
-- logo/colour when it knows the plan — and get_company_plan_flags() needs the
-- company id to answer. Without it the page fails open and a Starter company
-- would show custom branding it isn't entitled to.
--
-- The id itself is not sensitive: resolve_qr_code() has returned it to every
-- anonymous scanner since 0013, and it unlocks nothing on its own (every
-- tenant table is RLS-scoped to the caller's own company).

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
        'created_at', ra.created_at
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
