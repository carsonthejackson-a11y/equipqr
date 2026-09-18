-- 0029_guide_steps_repoint_on_delete.sql
--
-- Bug: deleting a guide step that any `continue` option points at fails.
-- 0005 declared `guide_options.next_step_id references guide_steps(id) on
-- delete set null` AND the CHECK `guide_options_continue_needs_target`
-- (outcome <> 'continue' or next_step_id is not null). The referential
-- action fires after the row is gone, tries to null next_step_id on every
-- option that continued to it, and the CHECK rejects that row — so the
-- delete raises 23514. Any non-trivial guide (a "Start over" branch back to
-- the root, two nodes that continue to each other, or simply a middle node
-- that another node continues to) cannot lose a node from the dashboard
-- (deleteGuideStep in src/app/dashboard/equipment-types/actions.ts), and
-- because guide_steps cascades from equipment_types, the equipment type
-- itself can no longer be deleted either (deleteEquipmentType).
--
-- Fix: a BEFORE DELETE row trigger on guide_steps that turns every option
-- still continuing to the doomed step into an `escalate` branch (the same
-- fallback 0005's backfill gave a chain's last node) before the FK action
-- runs. It fires for cascaded deletes too, so removing an equipment type
-- repoints as it goes and the cascade completes.
--
-- SECURITY DEFINER on purpose: the options that continue to a step are
-- normally options of steps under the same equipment type, which the
-- deleting staff user's own "Staff manage own guide options" policy (0005)
-- would let through — but guide_options.next_step_id is not tenant-checked
-- (step ids are public via resolve_qr_code), so a stray option in ANOTHER
-- company pointing at this step is invisible under the caller's RLS, would
-- not be repointed, and the delete would still fail with 23514. Running as
-- definer repoints it too. That is safe: the trigger only ever rewrites
-- options that continue to a step the caller is already allowed to delete,
-- writes nothing else, and returns nothing (validated both ways on the
-- local harness). It is not callable directly (execute revoked below).
--
-- No enum changes, so this runs inside a single transaction.

create or replace function guide_steps_repoint_options()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 0029: must run BEFORE the `on delete set null` action on
  -- guide_options.next_step_id, which would otherwise trip
  -- guide_options_continue_needs_target for every `continue` option.
  -- The `exists` guard matters when a whole equipment type cascades: a step
  -- deleted earlier in the same statement is already gone, so an option it
  -- owns is about to be cascade-deleted and must not be re-written (its
  -- guide_step_id FK would be re-checked against the vanished parent).
  update guide_options go
  set outcome = 'escalate', next_step_id = null
  where go.next_step_id = old.id
    and exists (select 1 from guide_steps gs where gs.id = go.guide_step_id);
  return old;
end;
$$;

drop trigger if exists guide_steps_repoint_options on guide_steps;
create trigger guide_steps_repoint_options
  before delete on guide_steps
  for each row execute function guide_steps_repoint_options();

revoke execute on function guide_steps_repoint_options() from public, anon, authenticated;

comment on function guide_steps_repoint_options() is
  'Trigger only — not directly callable. Before a guide step is deleted, every option that continued to it becomes an escalate branch, so the FK''s on-delete-set-null never violates guide_options_continue_needs_target (0029).';
