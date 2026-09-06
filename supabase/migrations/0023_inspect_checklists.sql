-- 0023_inspect_checklists.sql
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
-- The policy only ever allows source = 'staff': a technician can create a
-- request attributed to themselves, but can never insert a row claiming to
-- be a customer scan, a PM schedule, or the public API — those still only
-- come from their own security-definer paths. Purely additive.
create policy "Staff insert own company staff-sourced requests" on service_requests
  for insert to authenticated
  with check (
    company_id = get_my_company_id()
    and source = 'staff'
  );

comment on policy "Staff insert own company staff-sourced requests" on service_requests is
  'Lets staff create a source=staff request directly (scan-to-inspect follow-up requests, staff-logged visits). Anonymous/customer submissions still only go through submit_service_request().';
