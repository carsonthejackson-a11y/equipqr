-- 0020_staff_request_insert.sql
--
-- Workstream D (scan-to-inspect checklists + inspections). The
-- checklist_templates / inspections tables and their RLS already shipped in
-- 0019 — this migration only fills one real gap the Next roadmap surfaced:
--
-- 0001 deliberately gave staff no INSERT policy on service_requests
-- ("anonymous submissions only happen via submit_service_request()"). But
-- scan-to-inspect's "N items failed — Create a service request" button runs
-- from an authenticated staff session, not a QR scan, so it has no anon
-- token to call that RPC through. The same gap applies to any other
-- dashboard/staff-scan-mode flow that creates a request directly (e.g. a
-- staff "log a visit" action) — this policy is scoped narrowly enough that
-- it's safe for any workstream's staff-authenticated code to rely on.
--
-- The policy allows source = 'staff' (scan-to-inspect follow-ups, "log a
-- visit" from staff scan mode) and source = 'pm' (the dashboard's "Mark
-- maintenance done" creates-and-resolves a PM request so the 0019 trigger
-- rolls the schedule forward). A technician can never insert a row claiming
-- to be a customer scan or the public API — those still only come from
-- their own security-definer paths. Purely additive.
create policy "Staff insert own company staff-sourced requests" on service_requests
  for insert to authenticated
  with check (
    company_id = get_my_company_id()
    and source in ('staff', 'pm')
  );

comment on policy "Staff insert own company staff-sourced requests" on service_requests is
  'Lets staff create a source=staff or source=pm request directly (scan-to-inspect follow-ups, staff-logged visits, mark-maintenance-done). Anonymous/customer submissions still only go through submit_service_request().';
