-- Team invitations, member management, and role permission tightening.
--
-- Lets a company owner invite a second (or third...) staff member by email,
-- have them create an account (or log in) and land in the company via a
-- signed, unguessable invitation token, and lets owners manage existing
-- members' roles afterwards. Also tightens a couple of RLS policies that
-- were previously "any staff member" to "owners only" now that companies
-- can have more than one user.

-- ============================================================================
-- is_company_owner(): security definer helper, mirrors get_my_company_id()'s
-- shape so policies can check "is this caller an owner of their own company"
-- without RLS recursion.
-- ============================================================================

create or replace function is_company_owner()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'owner'
  );
$$;

grant execute on function is_company_owner() to authenticated;

-- ============================================================================
-- invitations
-- ============================================================================

create table invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  email text not null,
  role user_role not null default 'technician',
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  invited_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index invitations_company_id_idx on invitations (company_id);

-- Only one live invite per (company, email) at a time — a fresh invite to
-- someone who already has a pending one should reuse/replace it (handled in
-- the app) rather than silently stacking duplicates.
create unique index invitations_company_email_pending_idx
  on invitations (company_id, lower(email))
  where status = 'pending';

-- Normalize case at write time regardless of caller, so the partial unique
-- index above and the equality check in accept_invitation() are reliable
-- without requiring every caller to remember to lowercase first.
create or replace function invitations_lowercase_email()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(new.email);
  return new;
end;
$$;

create trigger invitations_lowercase_email_trigger
  before insert or update on invitations
  for each row execute function invitations_lowercase_email();

alter table invitations enable row level security;

-- Owners only — technicians have no visibility into pending invitations.
create policy "Owners view own company invitations" on invitations
  for select using (company_id = get_my_company_id() and is_company_owner());

create policy "Owners insert own company invitations" on invitations
  for insert with check (company_id = get_my_company_id() and is_company_owner());

create policy "Owners update own company invitations" on invitations
  for update using (company_id = get_my_company_id() and is_company_owner())
  with check (company_id = get_my_company_id() and is_company_owner());

create policy "Owners delete own company invitations" on invitations
  for delete using (company_id = get_my_company_id() and is_company_owner());

-- ============================================================================
-- get_invitation(): public read path for the /invite/[token] landing page.
-- Never exposes ids (invitation id, company id, inviter id) — just enough to
-- render "{company} invited you to join as a {role}" and decide what to do
-- next. Returns null for an unknown token instead of raising, so the page
-- can show a plain "not found" message.
-- ============================================================================

create or replace function get_invitation(p_token text)
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_invite record;
  v_effective_status text;
begin
  select i.status, i.email, i.role, i.expires_at, c.name as company_name
  into v_invite
  from invitations i
  join companies c on c.id = i.company_id
  where i.token = p_token;

  if not found then
    return null;
  end if;

  v_effective_status := v_invite.status;
  if v_effective_status = 'pending' and v_invite.expires_at < now() then
    v_effective_status := 'expired';
  end if;

  return json_build_object(
    'company_name', v_invite.company_name,
    'email', v_invite.email,
    'role', v_invite.role,
    'status', v_effective_status,
    'expires_at', v_invite.expires_at
  );
end;
$$;

grant execute on function get_invitation(text) to anon, authenticated;

-- ============================================================================
-- accept_invitation(): the only way a second user ever joins an existing
-- company. Validates the token is pending & unexpired, that the caller is
-- authenticated as the invited email (case-insensitive), and that the caller
-- doesn't already belong to a different company, then creates their profile
-- and marks the invite accepted. Returns the company id so the caller can
-- redirect straight into /dashboard.
-- ============================================================================

create or replace function accept_invitation(p_token text, p_full_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite invitations%rowtype;
  v_caller_email text;
  v_existing_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated';
  end if;

  select * into v_invite from invitations where token = p_token for update;

  if not found then
    raise exception 'Invitation not found';
  end if;

  if v_invite.status = 'pending' and v_invite.expires_at < now() then
    update invitations set status = 'expired' where id = v_invite.id;
    v_invite.status := 'expired';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'This invitation is no longer valid';
  end if;

  select email into v_caller_email from auth.users where id = auth.uid();

  if v_caller_email is null or lower(v_caller_email) <> v_invite.email then
    raise exception 'This invitation was sent to a different email address';
  end if;

  select company_id into v_existing_company_id from profiles where id = auth.uid();

  if v_existing_company_id is not null then
    if v_existing_company_id = v_invite.company_id then
      -- Already a member of this company (e.g. a retried click) — treat as
      -- success instead of erroring.
      update invitations set status = 'accepted', accepted_at = now() where id = v_invite.id;
      return v_existing_company_id;
    end if;

    raise exception 'You already belong to a company';
  end if;

  -- TODO(billing): member limit enforced in server action (invite creation
  -- time), not here — a company that lowered its seat count after sending an
  -- invite can still have that invite accepted.
  insert into profiles (id, company_id, full_name, role)
  values (auth.uid(), v_invite.company_id, nullif(trim(p_full_name), ''), v_invite.role);

  update invitations set status = 'accepted', accepted_at = now() where id = v_invite.id;

  return v_invite.company_id;
end;
$$;

grant execute on function accept_invitation(text, text) to authenticated;

-- ============================================================================
-- get_company_members(): owners AND technicians can see their teammates
-- (view-only for technicians — the team management page itself is gated to
-- owners in the app). profiles has no email column, so this joins to
-- auth.users server-side rather than adding one to keep in sync.
-- ============================================================================

create or replace function get_company_members()
returns json
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_company_id uuid;
  result json;
begin
  v_company_id := get_my_company_id();

  if v_company_id is null then
    return '[]'::json;
  end if;

  select coalesce(json_agg(json_build_object(
    'id', p.id,
    'full_name', p.full_name,
    'email', u.email,
    'role', p.role,
    'created_at', p.created_at
  ) order by p.created_at), '[]'::json)
  into result
  from profiles p
  join auth.users u on u.id = p.id
  where p.company_id = v_company_id;

  return result;
end;
$$;

grant execute on function get_company_members() to authenticated;

-- ============================================================================
-- update_member_role() / remove_member(): owner-only member management.
-- security definer so they can bypass the narrow "update own profile only"
-- RLS policy on profiles, while enforcing the ownership + last-owner rules
-- themselves.
-- ============================================================================

create or replace function update_member_role(p_user_id uuid, p_role user_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_target_company_id uuid;
  v_owner_count int;
begin
  if not is_company_owner() then
    raise exception 'Only owners can change member roles';
  end if;

  v_company_id := get_my_company_id();

  select company_id into v_target_company_id from profiles where id = p_user_id;

  if v_target_company_id is null or v_target_company_id <> v_company_id then
    raise exception 'Member not found';
  end if;

  if p_user_id = auth.uid() and p_role <> 'owner' then
    select count(*) into v_owner_count from profiles where company_id = v_company_id and role = 'owner';
    if v_owner_count <= 1 then
      raise exception 'You are the last owner — promote another member before stepping down';
    end if;
  end if;

  update profiles set role = p_role where id = p_user_id and company_id = v_company_id;
end;
$$;

grant execute on function update_member_role(uuid, user_role) to authenticated;

create or replace function remove_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_target_company_id uuid;
  v_target_role user_role;
  v_owner_count int;
begin
  if not is_company_owner() then
    raise exception 'Only owners can remove members';
  end if;

  v_company_id := get_my_company_id();

  select company_id, role into v_target_company_id, v_target_role from profiles where id = p_user_id;

  if v_target_company_id is null or v_target_company_id <> v_company_id then
    raise exception 'Member not found';
  end if;

  if p_user_id = auth.uid() and v_target_role = 'owner' then
    select count(*) into v_owner_count from profiles where company_id = v_company_id and role = 'owner';
    if v_owner_count <= 1 then
      raise exception 'You are the last owner — you cannot remove yourself';
    end if;
  end if;

  delete from profiles where id = p_user_id and company_id = v_company_id;
end;
$$;

grant execute on function remove_member(uuid) to authenticated;

-- ============================================================================
-- RLS tightening now that a company can have more than one user.
-- ============================================================================

-- companies: only owners can update company profile/notification settings.
drop policy "Owners can update own company" on companies;

create policy "Owners can update own company" on companies
  for update using (id = get_my_company_id() and is_company_owner())
  with check (id = get_my_company_id() and is_company_owner());

-- equipment_types: any staff member can view/create/edit, but only owners
-- can delete (previously a single `for all` policy covered everyone).
drop policy "Staff manage own equipment types" on equipment_types;

create policy "Staff view own equipment types" on equipment_types
  for select using (company_id = get_my_company_id());

create policy "Staff insert own equipment types" on equipment_types
  for insert with check (company_id = get_my_company_id());

create policy "Staff update own equipment types" on equipment_types
  for update using (company_id = get_my_company_id()) with check (company_id = get_my_company_id());

create policy "Owners delete own equipment types" on equipment_types
  for delete using (company_id = get_my_company_id() and is_company_owner());

-- customers: same split as equipment_types.
drop policy "Staff manage own customers" on customers;

create policy "Staff view own customers" on customers
  for select using (company_id = get_my_company_id());

create policy "Staff insert own customers" on customers
  for insert with check (company_id = get_my_company_id());

create policy "Staff update own customers" on customers
  for update using (company_id = get_my_company_id()) with check (company_id = get_my_company_id());

create policy "Owners delete own customers" on customers
  for delete using (company_id = get_my_company_id() and is_company_owner());
