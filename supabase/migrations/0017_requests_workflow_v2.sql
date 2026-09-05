-- Request workflow v2 (inbox filters/sort, detail actions, activity feed).
--
-- The foundation (0013) already gave request_activity, priority, assignment,
-- public_token, etc. — see docs/NOW-ROADMAP-BRIEF.md. The one thing the app
-- layer can't do on its own is sort an inbox by priority *severity* (low /
-- normal / high / urgent is a CHECK-constrained text column, so it sorts
-- alphabetically, not by severity) while still paginating at the database
-- level. This adds a small generated column for that and nothing else.

alter table service_requests
  add column if not exists priority_rank smallint generated always as (
    case priority
      when 'urgent' then 4
      when 'high' then 3
      when 'normal' then 2
      else 1
    end
  ) stored;

create index if not exists service_requests_priority_rank_created_idx
  on service_requests (company_id, priority_rank desc, created_at desc);
