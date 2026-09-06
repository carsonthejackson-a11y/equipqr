-- 0024_pm_reminder_pending.sql
--
-- PM reminders (integration fix): the daily job needs "units whose current
-- due date hasn't been reminded yet", i.e. `pm_reminder_sent_for IS DISTINCT
-- FROM next_service_due_on`. PostgREST can't compare two columns, so the
-- cron pulled a capped batch ordered by due date and filtered in TypeScript.
-- Overdue units that WERE reminded stay overdue (until someone services
-- them) and sort first, so once enough of them accumulate across all tenants
-- they fill the whole batch and newer units never get their reminder.
--
-- A stored generated column makes the condition filterable and indexable.
-- Additive; nothing from 0019 changes.

alter table equipment
  add column if not exists pm_reminder_pending boolean
    generated always as (
      next_service_due_on is not null
      and (pm_reminder_sent_for is null or pm_reminder_sent_for <> next_service_due_on)
    ) stored;

comment on column equipment.pm_reminder_pending is
  'True while next_service_due_on is set and differs from pm_reminder_sent_for — i.e. the daily PM job still owes a reminder for the current due date.';

create index if not exists equipment_pm_reminder_pending_idx
  on equipment (next_service_due_on)
  where pm_reminder_pending;
