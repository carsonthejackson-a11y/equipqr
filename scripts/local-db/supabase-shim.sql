-- supabase-shim.sql
--
-- Makes a vanilla local PostgreSQL 16 instance look enough like a Supabase
-- project that supabase/migrations/*.sql can run against it unmodified, so
-- migrations can be validated without a real Supabase project.
--
-- This file is applied ONCE per fresh `equipqr` database, before any of the
-- files under supabase/migrations/ (see scripts/local-db/db.sh `reset`).
--
-- Derived by reading every file in supabase/migrations/*.sql and grepping for
-- Supabase-specific references. What migrations 0001-0012 actually touch:
--   - `create extension if not exists "pgcrypto"` (0001, 0004)
--   - `auth.users(id)` as an FK target, and `auth.uid()` in RLS policies /
--     security-definer functions (0001, 0004, 0005, 0007, 0008, 0009, 0011, 0012)
--   - roles `anon`, `authenticated`, `service_role` named in GRANT/REVOKE and
--     in `create policy ... to anon, authenticated` (all files)
--   - `storage.buckets` / `storage.objects`, with RLS policies added directly
--     against storage.objects (0001) — no `pg_net`, `vault`, `pg_cron`,
--     `uuid-ossp`, or an `extensions` schema are referenced anywhere.
-- Nothing else Supabase-specific (no supabase_functions, no net.http_*, no
-- graphql) shows up in the migration set as of 0012.
--
-- Safe to re-run: every object below is created with an existence guard.

-- ============================================================================
-- Extensions
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- Roles
-- ============================================================================
-- Supabase's `anon` / `authenticated` / `service_role` are NOLOGIN roles that
-- table/function grants and RLS policies reference by name. Migrations never
-- log in as them directly (PostgREST would, in a real project), so NOLOGIN
-- is sufficient here — we only need the role names to exist for GRANT/REVOKE
-- and `create policy ... to anon, authenticated` to resolve.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;

-- Supabase grants the API roles full table/sequence/function privileges on
-- everything created in `public` (RLS is what actually scopes access), via
-- default privileges. Mirror that so `set role authenticated` tests behave
-- like a real Supabase session.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- ============================================================================
-- auth schema
-- ============================================================================

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb,
  created_at timestamptz not null default now()
);

-- Supabase's auth.uid(): the JWT `sub` claim of the current request, as set
-- by PostgREST via `request.jwt.claim.sub`. Local psql sessions run as
-- superuser with no claim set, so this returns null unless a test explicitly
-- does `set local request.jwt.claim.sub = '<uuid>'`.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role, public;

-- ============================================================================
-- storage schema
-- ============================================================================

create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text,
  public boolean default false,
  created_at timestamptz default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz default now(),
  metadata jsonb
);

alter table storage.objects enable row level security;

grant usage on schema storage to anon, authenticated, service_role;
grant select, insert on storage.buckets to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
