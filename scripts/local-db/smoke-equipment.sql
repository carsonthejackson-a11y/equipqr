\set ON_ERROR_STOP on
-- Smoke suite for workstream Q (PM reminders + custom fields; migration 0022).
-- Run after smoke.sql and smoke-next.sql on a fresh `db.sh reset`:
--   psql "$(scripts/local-db/db.sh url)" -f scripts/local-db/smoke.sql
--   psql "$(scripts/local-db/db.sh url)" -f scripts/local-db/smoke-next.sql
--   psql "$(scripts/local-db/db.sh url)" -f scripts/local-db/smoke-equipment.sql
-- Depends on the rows those seed: company A, its owner, equipment
-- dddddddd-…, the legacy token 0123456789abcdef01234567, and the two custom
-- field definitions (filter_size select, asset_tag text) with values on the
-- unit ({"filter_size":"16x20","asset_tag":"A-1"}).

reset role;
reset request.jwt.claim.sub;

-- ============================================================================
-- 1. resolve_qr_code(): only show_on_scan_page fields with a value leak out
-- ============================================================================
-- Nothing is flagged yet: the array is present and empty.
set role anon;
do $$
declare v json;
begin
  v := (resolve_qr_code('0123456789abcdef01234567'))->'guide'->'equipment'->'custom_fields';
  if v is null then
    raise exception 'scan: custom_fields key missing from the guide';
  end if;
  if json_array_length(v) <> 0 then
    raise exception 'LEAK: % custom field(s) shown on scan page with none flagged', json_array_length(v);
  end if;
  raise notice 'ok: no custom fields shown when none are flagged';
end $$;
reset role;

-- Flag filter_size, add a boolean and a flagged-but-empty field.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update equipment_custom_fields set show_on_scan_page = true
where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and key = 'filter_size';
insert into equipment_custom_fields (company_id, key, label, field_type, show_on_scan_page, sort_order)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'has_drain_pan', 'Has drain pan', 'boolean', true, 0),
       ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'voltage', 'Voltage', 'number', true, 5);
update equipment
set custom_fields = '{"filter_size":"16x20","asset_tag":"A-1","has_drain_pan":true,"voltage":null}'
where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
reset role;
reset request.jwt.claim.sub;

set role anon;
select json_array_elements((resolve_qr_code('0123456789abcdef01234567'))->'guide'->'equipment'->'custom_fields') as shown;
do $$
declare
  v json;
  v_text text;
begin
  v := (resolve_qr_code('0123456789abcdef01234567'))->'guide'->'equipment'->'custom_fields';
  v_text := v::text;
  -- Sort order: has_drain_pan (0) before filter_size (1); voltage (null) absent.
  if json_array_length(v) <> 2 then
    raise exception 'scan: expected 2 custom fields, got % (%)', json_array_length(v), v_text;
  end if;
  if (v->0->>'label') <> 'Has drain pan' or (v->0->>'value') <> 'Yes' then
    raise exception 'scan: first field should be "Has drain pan: Yes", got %', v->0;
  end if;
  if (v->1->>'label') <> 'Filter size' or (v->1->>'value') <> '16x20' then
    raise exception 'scan: second field should be "Filter size: 16x20", got %', v->1;
  end if;
  if v_text like '%asset_tag%' or v_text like '%A-1%' then
    raise exception 'LEAK: unflagged custom field reached the scan page (%)', v_text;
  end if;
  if v_text like '%"key"%' or v_text like '%help_text%' then
    raise exception 'LEAK: custom field internals reached the scan page (%)', v_text;
  end if;
  raise notice 'ok: scan page shows flagged fields only, in order, booleans as Yes/No';
end $$;
reset role;

-- The rest of the guide is unchanged by 0022.
set role anon;
select (resolve_qr_code('0123456789abcdef01234567'))->>'status' as still_claimed,
       (resolve_qr_code('0123456789abcdef01234567'))->'guide'->'code'->>'status' as code_status,
       json_array_length((resolve_qr_code('0123456789abcdef01234567'))->'guide'->'steps') as steps;
reset role;

-- ============================================================================
-- 2. PM reminder bookkeeping the cron relies on
-- ============================================================================
-- pm_reminder_sent_for is a plain date column the job stamps; it must accept
-- the due date and survive the recompute trigger.
update equipment set service_interval_days = 30, last_serviced_at = '2026-08-01T12:00:00Z'
where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
update equipment set pm_reminder_sent_for = next_service_due_on
where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
do $$
declare r equipment;
begin
  select * into r from equipment where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  if r.next_service_due_on <> date '2026-08-31' then
    raise exception 'PM: expected due 2026-08-31, got %', r.next_service_due_on;
  end if;
  if r.pm_reminder_sent_for <> r.next_service_due_on then
    raise exception 'PM: stamp did not stick (% vs %)', r.pm_reminder_sent_for, r.next_service_due_on;
  end if;
  raise notice 'ok: pm_reminder_sent_for stamped = %', r.pm_reminder_sent_for;
end $$;
-- A later service moves the due date, so the stamp no longer matches — that
-- is exactly what makes the job send again.
update equipment set last_serviced_at = '2026-09-01T12:00:00Z'
where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
do $$
declare r equipment;
begin
  select * into r from equipment where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  if r.pm_reminder_sent_for = r.next_service_due_on then
    raise exception 'PM: stamp should differ from the new due date';
  end if;
  raise notice 'ok: new due date % is distinct from stamp %', r.next_service_due_on, r.pm_reminder_sent_for;
end $$;

-- The system actor can write a pm_due timeline row (what the cron inserts via the admin client).
set role service_role;
insert into equipment_events (company_id, equipment_id, kind, summary, actor_kind, details)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'pm_due', 'Maintenance due 2026-10-01', 'system', '{"due_on":"2026-10-01"}');
select count(*) as pm_due_events from equipment_events where kind = 'pm_due';
reset role;

\echo smoke-equipment: all assertions passed

-- ============================================================================
-- 0024: pm_reminder_pending tracks the stamp vs the due date
-- ============================================================================
reset role;
reset request.jwt.claim.sub;
do $$
declare r record;
begin
  update equipment set service_interval_days = 30, last_serviced_at = now() - interval '40 days', pm_reminder_sent_for = null
  where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  select pm_reminder_pending, next_service_due_on, pm_reminder_sent_for into r from equipment where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  if not r.pm_reminder_pending then raise exception 'PM: pending should be true before any reminder'; end if;
  update equipment set pm_reminder_sent_for = next_service_due_on where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  select pm_reminder_pending into r from equipment where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  if r.pm_reminder_pending then raise exception 'PM: pending should be false once stamped'; end if;
  -- A new service moves the due date; the stamp is now stale → pending again.
  update equipment set last_serviced_at = now() where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  select pm_reminder_pending into r from equipment where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  if not r.pm_reminder_pending then raise exception 'PM: pending should flip back when the due date advances'; end if;
  -- Off the schedule entirely → nothing pending.
  update equipment set service_interval_days = null, next_service_due_on = null where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  select pm_reminder_pending into r from equipment where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  if r.pm_reminder_pending then raise exception 'PM: pending should be false with no due date'; end if;
  raise notice 'ok: pm_reminder_pending (0024) follows stamp vs due date';
end $$;
\echo smoke-equipment: 0024 assertions passed
