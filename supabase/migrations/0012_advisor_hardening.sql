-- Supabase advisor findings (security + performance), post-launch hardening.
--
-- 1. Postgres grants EXECUTE on new functions to PUBLIC by default, so every
--    SECURITY DEFINER function here was callable by the `anon` role even though
--    each one checks auth.uid() internally. Revoke from public/anon on the
--    staff-only functions (defense in depth). The genuinely public ones
--    (resolve_qr_code, get_equipment_guide, submit_service_request, record_scan,
--    get_invitation, get_company_plan_flags) keep their anon grant on purpose.
-- 2. Trigger functions are never called via RPC — revoke entirely.
-- 3. invitations_lowercase_email() had a mutable search_path.
-- 4. Covering indexes for foreign keys the linter flagged.
-- 5. profiles policies: wrap auth.uid() in (select ...) so it's evaluated once
--    per query instead of once per row.

-- 1. Staff-only RPCs: authenticated only.
revoke execute on function public.accept_invitation(text, text) from public, anon;
revoke execute on function public.create_company_and_profile(text, text, text) from public, anon;
revoke execute on function public.delete_company() from public, anon;
revoke execute on function public.generate_qr_code_batch(uuid, integer) from public, anon;
revoke execute on function public.claim_qr_code(text, uuid) from public, anon;
revoke execute on function public.get_company_entitlements() from public, anon;
revoke execute on function public.get_company_members() from public, anon;
revoke execute on function public.remove_member(uuid) from public, anon;
revoke execute on function public.update_member_role(uuid, public.user_role) from public, anon;
-- get_my_company_id / is_company_owner / is_platform_admin are referenced inside RLS
-- policies that anon queries also evaluate, so they intentionally stay callable.

-- Public-by-design RPCs: drop the implicit PUBLIC grant but keep anon + authenticated.
revoke execute on function public.resolve_qr_code(text) from public;
revoke execute on function public.get_equipment_guide(text) from public;
revoke execute on function public.submit_service_request(text, text, text, text, text, jsonb, jsonb) from public;
revoke execute on function public.record_scan(text, text) from public;
revoke execute on function public.get_invitation(text) from public;
revoke execute on function public.get_company_plan_flags(uuid) from public;

-- 2. Trigger functions.
revoke execute on function public.enforce_equipment_limit() from public, anon, authenticated;
revoke execute on function public.invitations_lowercase_email() from public, anon, authenticated;

-- 3. Pin search_path on the trigger function.
alter function public.invitations_lowercase_email() set search_path = public;

-- 4. Foreign-key covering indexes.
create index if not exists profiles_company_id_idx on public.profiles (company_id);
create index if not exists equipment_types_company_id_idx on public.equipment_types (company_id);
create index if not exists equipment_equipment_type_id_idx on public.equipment (equipment_type_id);
create index if not exists service_requests_equipment_id_idx on public.service_requests (equipment_id);
create index if not exists invitations_invited_by_idx on public.invitations (invited_by);

-- 5. profiles RLS: evaluate auth.uid() once per statement.
drop policy "Staff can view own profile or teammates" on public.profiles;
create policy "Staff can view own profile or teammates" on public.profiles
  for select using (id = (select auth.uid()) or company_id = get_my_company_id());

drop policy "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile" on public.profiles
  for insert with check (id = (select auth.uid()));

drop policy "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles
  for update using (id = (select auth.uid())) with check (id = (select auth.uid()));
