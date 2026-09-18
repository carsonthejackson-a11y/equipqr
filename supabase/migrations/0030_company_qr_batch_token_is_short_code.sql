-- 0030_company_qr_batch_token_is_short_code.sql
--
-- Bug: generate_company_qr_batch() (0019 §7, the owner's scan-to-onboard
-- pool) inserted `token = encode(gen_random_bytes(12), 'hex')` next to a
-- fresh short_code. Every other code minted since 0013 has
-- `token = short_code` — generate_qr_code_batch() (0013) and the instant
-- path both do — and docs/QR-LABELS.md relies on it: the sticker URL is
-- /e/<short_code>, which is what buys the error-correction level and the
-- 1"x1" label sizes. Codes from this RPC instead printed a 24-hex URL and a
-- short code that did not match what the QR encoded.
--
-- Fix: re-created with the 0019 body (same owner check, same 1..100 bounds,
-- same source/status columns, same grants), minting one short code per row
-- and storing it as BOTH token and short_code. Rows already minted by the
-- 0019 version keep their hex tokens: they may be on printed stickers, and
-- resolve_qr_code()/find_qr_code() match on either column, so nothing
-- printed breaks.
--
-- No enum changes, so this runs inside a single transaction.

create or replace function generate_company_qr_batch(p_count int)
returns setof qr_codes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := get_my_company_id();
  v_short text;
  i int;
begin
  if v_company is null or not is_company_owner() then
    raise exception 'Only company owners can generate a code batch' using errcode = '42501';
  end if;
  if p_count is null or p_count < 1 or p_count > 100 then
    raise exception 'Batch size must be between 1 and 100' using errcode = '22023';
  end if;

  -- 0030: token = short_code, like every code minted since 0013.
  for i in 1..p_count loop
    v_short := generate_short_code();
    return query
      insert into qr_codes (token, short_code, company_id, equipment_id, source, status)
      values (v_short, v_short, v_company, null, 'batch', 'active')
      returning *;
  end loop;
end;
$$;

comment on function generate_company_qr_batch(int) is
  'Owner-only. Creates up to 100 unclaimed pre-printed codes for the caller''s company (scan-to-onboard). token = short_code (0030).';

revoke execute on function generate_company_qr_batch(int) from public, anon;
grant execute on function generate_company_qr_batch(int) to authenticated;
