-- Adds a customers table and links equipment to a customer, with an
-- equipment-level address/contact that's auto-populated (client-side) from
-- the selected customer but stored per-equipment so it can be edited if a
-- unit lives at a different site than the customer's main address.

create table customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  address text,
  contact_name text,
  contact_email text,
  contact_phone text,
  created_at timestamptz not null default now()
);

create index customers_company_id_idx on customers (company_id);

alter table equipment
  add column customer_id uuid references customers(id) on delete set null,
  add column address text,
  add column contact_name text,
  add column contact_phone text;

create index equipment_customer_id_idx on equipment (customer_id);

alter table customers enable row level security;

create policy "Staff manage own customers" on customers
  for all using (company_id = get_my_company_id()) with check (company_id = get_my_company_id());
