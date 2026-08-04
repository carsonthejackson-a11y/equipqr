-- AI-generated summary of a customer's troubleshooting path, shown to staff
-- alongside the raw question/answer list already captured in
-- service_requests.troubleshooting_path. Nullable: stays null if the
-- summarization call fails or ANTHROPIC_API_KEY isn't configured.

alter table service_requests
  add column ai_summary text;
