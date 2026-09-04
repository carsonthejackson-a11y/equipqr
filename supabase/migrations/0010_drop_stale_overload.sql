-- 0005_branching_guides.sql redefined submit_service_request with an extra
-- p_troubleshooting_path argument. Postgres identifies functions by their
-- argument types, so `create or replace` created a second overload and left
-- the original 6-argument version from 0001 in place (still granted to anon).
-- Nothing calls it anymore; drop it so there's exactly one entry point.
drop function if exists public.submit_service_request(text, text, text, text, text, jsonb);
