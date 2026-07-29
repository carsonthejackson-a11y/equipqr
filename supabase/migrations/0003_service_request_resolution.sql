-- Adds structured close-out fields to service_requests so staff can record
-- what was done, optional future recommendations, and when a completion
-- summary email was sent to the customer.

alter table service_requests
  add column resolution_summary text,
  add column resolution_recommendations text,
  add column resolved_at timestamptz,
  add column resolution_email_sent_at timestamptz;
