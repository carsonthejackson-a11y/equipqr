# "Owner" roadmap — engineering brief for workstream agents

Phase 1 of `equipqr-business-side-concept.md` (Model A: equipment-owner accounts,
vendor contact cards, email dispatch). Read, in order:

1. `AGENTS.md` — **this is a customized Next.js 16.2.12.** After `npm install`, read
   the relevant guide under `node_modules/next/dist/docs/` before writing any route,
   route handler, server action, `params`/`searchParams` access, `after()`, or
   `revalidatePath` call. Do not assume upstream Next behaviour from memory.
2. `docs/AGENT-BRIEF.md` (stack, conventions, RLS rules) and
   `docs/NEXT-ROADMAP-BRIEF.md` (house style for these briefs; every contract it
   lists still holds).
3. `supabase/migrations/0019_next_roadmap_foundation.sql` — the RPC / RLS / grant
   pattern this build copies. Also `0018_public_rpc_hardening.sql` (the
   `is_service_role()` field-gating rule), `0007_billing.sql` (`plan_limits`,
   `enforce_equipment_limit`), `0013` (`request_activity`, `check_rate_limit`,
   `find_qr_code`), `0023` (the current `resolve_qr_code` body you are extending).
4. `scripts/local-db/smoke-next.sql` — the style `scripts/local-db/smoke-owner.sql`
   must match.

**Highest existing migration is `0023`. This build uses `0024` and `0025`. No other
migration numbers may be taken.**

Everything below is fixed. Do not redesign it; if something is genuinely
impossible, say so in your report and propose the smallest change.

---

## 1. Scope & non-goals

### In scope (Phase 1, Model A)

| # | Thing | Workstream |
|---|---|---|
| 1 | `companies.kind` (`service_provider` \| `equipment_owner`), chosen at sign-up | WS1 schema, WS2 UI |
| 2 | `locations` (+ optional `site_pin`), `vendors`, `category_default_vendors` | WS1 schema, WS2 CRUD |
| 3 | `equipment.location_id` / `vendor_id` / `warranty_vendor_id` | WS1 schema, WS2 form |
| 4 | `equipment_types.symptom_chips` + a 12-type restaurant seed set | WS1 column, WS2 seeding |
| 5 | Owner-kind public scan report form: symptom chips, free text, urgency, photo, reporter name + optional phone, site-PIN gate | WS3 |
| 6 | `dispatches` + immediate email dispatch on submit, `/v/<token>` vendor page and its RPCs | WS3 |
| 7 | Owner notification emails (new request, each vendor action) + `dispatch-sla` hourly cron | WS3 |
| 8 | Kind-aware dashboard vocabulary + nav; dispatch status on the request list and request page | WS1 vocab, WS2 UI, WS3 panel |
| 9 | Owner plans in `plan_limits` + `plans.ts` + Stripe price env vars; location-count enforcement | WS1 constants, WS4 wiring |
| 10 | `/restaurants` landing page, segmented `/pricing` | WS4 |
| 11 | `staff_badges` and `equipment_access` — **tables only, created empty, no UI, no policy changes anywhere else** | WS1 |

### Explicitly deferred (do not build, do not stub UI for)

- **All of Model B.** Nothing that bridges two companies. `equipment_access` stays
  empty; no RLS policy on `equipment`, `service_requests`, `service_request_media`,
  `request_activity` or `equipment_events` may reference it. `vendors.linked_company_id`
  exists as a column and is never read. `customers.linked_company_id` is **not** added.
- Shared requests, "claim your vendor inbox", owner "claim this equipment", provider-side
  sponsorship, the vendors-near-you directory.
- SMS dispatch / Twilio / TCPA consent capture. `vendors.sms_consent_at` and
  `dispatch_channel` values `sms`, `phone`, `url`, `platform` exist as data only —
  **only `email` is implemented**; any other `preferred_channel` falls back to email,
  and to the no-vendor-email path if the vendor has no email.
- Approval rules and the approval UI. `service_requests.requires_approval` exists and is
  **always `false`** in Phase 1; `approved_at` is stamped at submit, `approved_by` stays null.
- Staff roster / magic-link badge UI. Table only.
- The `staff` profile role is **defined in the enum and never granted** in Phase 1.
- Cost/invoice reporting ("should I replace this ice machine"). `cost_cents` and
  `dispatches.invoice_path` are captured; no reports, no per-unit cost rollup.
- PM schedules that dispatch to a vendor; warranty-vendor *routing rules* beyond the
  single `warranty_vendor_id` field being preferred when the unit is in warranty.
- Stock "try this first" troubleshooting guides for the restaurant set — see §5.3.
- Reply-by-email parsing; webhook event types for dispatch (the 0022 trigger
  deliberately ignores `kind='dispatch'`; do not extend it).
- History-retention enforcement. `plan_limits.history_days` is stored and shown in
  pricing copy only — **no data is filtered or deleted by it.**
- New Playwright specs (see §6.3).

---

## 2. Migrations

Two files, both owned by **WS1**. Additive only: nothing is dropped or renamed, every
existing token, sticker, URL and RPC signature keeps working.

### 2.0 File headers

`supabase/migrations/0024_owner_foundation.sql` **must begin with the line**

```
-- local-db: no-transaction
```

because it both adds `user_role` enum values and references them later in the same file
(`scripts/local-db/db.sh` reads that marker; see `0013` for precedent).

`supabase/migrations/0025_owner_rpcs.sql` takes no marker (plain transaction).

### 2.1 `0024_owner_foundation.sql`

#### 2.1.1 Enums

```sql
create type company_kind as enum ('service_provider', 'equipment_owner');
create type dispatch_channel as enum ('email', 'sms', 'phone', 'url', 'platform');
create type dispatch_status as enum
  ('pending_approval','sent','viewed','acknowledged','eta_given','finished','declined','failed');
create type equipment_relationship as enum ('owner', 'servicer');

alter type user_role add value if not exists 'manager' after 'owner';
alter type user_role add value if not exists 'staff' after 'technician';
```

`request_status` and the `service_requests.priority` CHECK are **unchanged** —
owner-kind urgency reuses `low | normal | high` exactly as the provider form does.

#### 2.1.2 Column additions

| Table | Column | Type / default / constraint |
|---|---|---|
| `companies` | `kind` | `company_kind not null default 'service_provider'` |
| `companies` | `owner_setup_completed_at` | `timestamptz` (null = owner first-run wizard not finished) |
| `equipment` | `location_id` | `uuid references locations(id) on delete set null` |
| `equipment` | `vendor_id` | `uuid references vendors(id) on delete set null` |
| `equipment` | `warranty_vendor_id` | `uuid references vendors(id) on delete set null` |
| `equipment_types` | `symptom_chips` | `text[] not null default '{}'::text[]` |
| `service_requests` | `requires_approval` | `boolean not null default false` |
| `service_requests` | `approved_at` | `timestamptz` |
| `service_requests` | `approved_by` | `uuid references profiles(id) on delete set null` |
| `service_requests` | `cost_cents` | `int check (cost_cents is null or cost_cents >= 0)` |
| `service_requests` | `reporter_phone` | `text` |
| `service_requests` | `location_id` | `uuid references locations(id) on delete set null` |
| `service_requests` | `dispatch_status` | `dispatch_status` (nullable, **denormalised**, trigger-maintained — §2.1.9) |
| `service_requests` | `dispatch_id` | `uuid` — **no foreign key**, denormalised pointer only (a real FK would make `service_requests ⇄ dispatches` circular against the cascade) |
| `plan_limits` | `company_kind` | `company_kind not null default 'service_provider'` |
| `plan_limits` | `max_locations` | `int` (null = unlimited) |
| `plan_limits` | `history_days` | `int` (null = unlimited; display only) |

All added with `add column if not exists`. Because `locations` / `vendors` are created
later in the file, **add the three `equipment` columns and `service_requests.location_id`
AFTER those tables exist.** Order the file: enums → `locations` → `vendors` →
`category_default_vendors` → column additions → `dispatches` → `staff_badges` →
`equipment_access` → `site_pin_passes` → constraint edits → plan_limits → triggers →
entitlement RPCs.

`reporter_phone` duplicates what is also written to `contact_phone` at submit time.
That is deliberate: `contact_phone` is the channel column every existing status email and
`add_customer_request_update()` already uses, and `reporter_phone` is the stable "who
reported it" value the owner UI shows. Both are written; neither is derived from the other.

#### 2.1.3 `locations`

```sql
create table locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  address text,
  phone text,
  hours text,
  site_pin text check (site_pin is null or site_pin ~ '^[0-9]{4,8}$'),
  notes text,
  active boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index locations_company_idx on locations (company_id, active, name);
create unique index locations_company_name_idx on locations (company_id, lower(name));
create trigger locations_set_updated_at
  before update on locations for each row execute function set_updated_at();
```

`site_pin` is stored **in plaintext**. It is a shared, low-value, owner-printable poster
code, not a credential — the owner has to be able to read it back to print it. The
security property is that **no anon-callable RPC ever returns it or any value derived
from it**; verification happens server-side and hands back an unrelated opaque pass
(§2.2.2). RLS keeps the column readable only to staff of the owning company.

#### 2.1.4 `vendors`

```sql
create table vendors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  email text check (email is null or email ~ '^[^@[:space:],;]+@[^@[:space:],;]+\.[^@[:space:],;]+$'),
  phone text,
  dispatch_url text,
  preferred_channel dispatch_channel not null default 'email',
  hours text,
  account_number text,
  categories text[] not null default '{}'::text[],
  notes text,
  sms_consent_at timestamptz,
  ack_sla_minutes int not null default 120 check (ack_sla_minutes between 15 and 10080),
  linked_company_id uuid references companies(id) on delete set null,
  active boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index vendors_company_idx on vendors (company_id, active, name);
create index vendors_linked_company_idx on vendors (linked_company_id);
create unique index vendors_company_name_idx on vendors (company_id, lower(name));
create trigger vendors_set_updated_at
  before update on vendors for each row execute function set_updated_at();
```

The email regex rejects `,`, `;`, whitespace and anything that could smuggle a second
recipient or a header into `sendEmail({ to })`. A vendor with **no** email is legal and
means "notify me only" — that path is handled in `submit_owner_service_request()`.

#### 2.1.5 `category_default_vendors`

```sql
create table category_default_vendors (
  company_id uuid not null references companies(id) on delete cascade,
  equipment_type_id uuid not null references equipment_types(id) on delete cascade,
  vendor_id uuid not null references vendors(id) on delete cascade,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (company_id, equipment_type_id)
);
create index category_default_vendors_vendor_idx on category_default_vendors (vendor_id);
```

#### 2.1.6 `dispatches`

```sql
create table dispatches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  service_request_id uuid not null references service_requests(id) on delete cascade,
  vendor_id uuid not null references vendors(id) on delete restrict,
  channel dispatch_channel not null default 'email',
  token text not null unique default encode(gen_random_bytes(24), 'hex'),   -- 48 hex chars
  status dispatch_status not null default 'sent',
  eta_at timestamptz,
  vendor_notes text,
  decline_reason text,
  invoice_path text,
  invoice_uploaded_at timestamptz,
  sent_at timestamptz,
  viewed_at timestamptz,
  acknowledged_at timestamptz,
  finished_at timestamptz,
  declined_at timestamptz,
  sla_alerted_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index dispatches_request_idx on dispatches (service_request_id, created_at desc);
create index dispatches_company_status_idx on dispatches (company_id, status);
create index dispatches_vendor_idx on dispatches (vendor_id);
create index dispatches_sla_idx on dispatches (sent_at)
  where sla_alerted_at is null and status in ('sent', 'viewed');
create trigger dispatches_set_updated_at
  before update on dispatches for each row execute function set_updated_at();
```

`vendor_id … on delete restrict` on purpose: a vendor with dispatch history cannot be
deleted, only deactivated (`active = false`). The UI must say so.

Token entropy: 24 random bytes = 192 bits, 48 hex chars — same generator family as
`service_requests.public_token` (0013) and strictly longer than the 32-char minimum.

#### 2.1.7 `staff_badges` (table only, Phase 2 UI)

```sql
create table staff_badges (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  location_id uuid references locations(id) on delete set null,
  display_name text not null,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  revoked_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index staff_badges_company_idx on staff_badges (company_id) where revoked_at is null;
```

No RPC, no grant to `anon`, no UI.

#### 2.1.8 `equipment_access` (empty, inert) and `site_pin_passes`

```sql
create table equipment_access (
  equipment_id uuid not null references equipment(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  relationship equipment_relationship not null,
  granted_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (equipment_id, company_id)
);
create index equipment_access_company_idx on equipment_access (company_id, relationship);
```

**This table gets a SELECT policy and nothing else.** No insert/update/delete policy, no
RPC writes it, no other policy in the database references it. It must still be empty
after `smoke-owner.sql` runs.

```sql
create table site_pin_passes (
  token text primary key default encode(gen_random_bytes(24), 'hex'),
  company_id uuid not null references companies(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  last_used_at timestamptz
);
create index site_pin_passes_location_idx on site_pin_passes (location_id, expires_at);
```

This table is the answer to "verify the PIN without leaking it": `verify_site_pin()`
compares server-side and hands the device an opaque, expiring, revocable pass that has
no relationship to the PIN's value. The browser stores the pass, not the PIN.

#### 2.1.9 Constraint edits and the denormalisation trigger

```sql
alter table request_activity drop constraint if exists request_activity_kind_check;
alter table request_activity add constraint request_activity_kind_check
  check (kind in ('note','message','status_change','assignment','priority_change',
                  'email_sent','system','dispatch'));

alter table request_activity drop constraint if exists request_activity_author_kind_check;
alter table request_activity add constraint request_activity_author_kind_check
  check (author_kind in ('staff','customer','system','vendor'));
```

The 0022 webhook trigger `request_activity_enqueue_webhook()` maps `kind='dispatch'` to
`null` and returns early — **leave it exactly as it is.** No new webhook event types.

```sql
create or replace function dispatches_sync_request()
returns trigger language plpgsql security definer set search_path = public as $$ … $$;

create trigger dispatches_sync_request
  after insert or delete or update of status on dispatches
  for each row execute function dispatches_sync_request();
```

Body contract: resolve the **most recently created** dispatch for
`coalesce(new.service_request_id, old.service_request_id)`
(`order by created_at desc, id desc limit 1`), then set
`service_requests.dispatch_id` and `.dispatch_status` to that row's `id` / `status`
(both to `null` when no dispatch remains), guarded by `is distinct from` so it is a no-op
when nothing changed. Returns `null`. `revoke execute … from public, anon, authenticated`.

#### 2.1.10 `plan_limits` rows and the two limit triggers

```sql
insert into plan_limits (id, equipment_limit, member_limit, company_kind, max_locations, history_days)
values
  ('free',        10, null, 'equipment_owner', 1,    30),
  ('site',        75, null, 'equipment_owner', 1,    null),
  ('multi_site', 400, null, 'equipment_owner', 5,    null)
on conflict (id) do nothing;

update plan_limits set company_kind = 'service_provider', max_locations = null
where id in ('starter','pro','business');
```

`enforce_equipment_limit()` is **re-created kind-aware** (same name, same trigger):

1. read `companies.kind` and `companies.trial_ends_at` for `new.company_id`;
2. read `subscriptions.plan_id` / `.status`;
3. trial active and status ≠ `active` → `v_plan_id := case kind when 'equipment_owner' then 'site' else 'pro' end`;
4. status not in (`active`,`trialing`) → `v_plan_id := case kind when 'equipment_owner' then 'free' else 'starter' end`;
5. **then**: if the resolved `plan_limits` row is missing, or its `company_kind` ≠ the
   company's kind, fall back to the kind's floor plan (`free` / `starter`). This is what
   stops an owner company with a stale `plan_id = 'business'` from getting 1 500 units.
6. `raise exception 'EQUIPMENT_LIMIT_REACHED: …'` — keep the existing message prefix,
   `src/lib/equipment.ts` and the UI match on it.

New sibling, same shape, `before insert on locations`:

```sql
create or replace function enforce_location_limit() returns trigger …
create trigger locations_enforce_limit before insert on locations
  for each row execute function enforce_location_limit();
```

Steps 1–5 identical; reads `max_locations`; `null` means unlimited (skip);
error text **`LOCATION_LIMIT_REACHED: this company's plan (%) allows up to % location(s)`**.

#### 2.1.11 Entitlement RPCs (re-created, same signatures)

`get_company_entitlements()` — add three keys to the returned JSON and change the lock rule:

| Key | Value |
|---|---|
| `company_kind` | `companies.kind` |
| `location_count` | `select count(*) from locations where company_id = …` |
| `max_locations` | resolved plan's `max_locations` (null = unlimited) |

Plan resolution mirrors §2.1.10 (trial → `site` / `pro`; lapsed → `free` / `starter`;
kind-mismatched plan row → the kind's floor plan).

**`is_locked` is always `false` when `kind = 'equipment_owner'`.** An owner that never
pays lands on `free` and is limited (1 location / 10 units) rather than locked out, because
a free tier exists for that kind. Providers are unchanged.

`get_company_plan_flags(p_company_id uuid)` — re-created with the same kind-aware
resolution and one new key, `company_kind`. Grants unchanged (`anon, authenticated`).

#### 2.1.12 `create_company_and_profile` — the arity rule

PostgREST resolves overloads by argument names, so a 4th argument **with a default**
would make the existing 3-argument call ambiguous. Do it this way and no other:

```sql
-- NEW: 4 args, NO default.  p_kind is TEXT (not the enum) so PostgREST never has to
-- cast an enum from JSON; the body validates it against ('service_provider','equipment_owner')
-- and raises 22023 otherwise.
create function create_company_and_profile(
  p_company_name text, p_notification_email text, p_full_name text, p_kind text
) returns uuid language plpgsql security definer set search_path = public as $$ … $$;

-- EXISTING 3-arg: create or replace, body becomes a one-line delegate.
create or replace function create_company_and_profile(
  p_company_name text, p_notification_email text, p_full_name text
) returns uuid language sql security definer set search_path = public as $$
  select create_company_and_profile(p_company_name, p_notification_email, p_full_name, 'service_provider')
$$;

grant execute on function create_company_and_profile(text, text, text) to authenticated;
grant execute on function create_company_and_profile(text, text, text, text) to authenticated;
```

The 4-arg body is the 0007 body plus `kind` in the `companies` insert. It keeps the
existing idempotency behaviour (returns the caller's existing `company_id` if a profile
already exists) and the `on conflict (id) do nothing` race handling **verbatim**.

#### 2.1.13 RLS — every new table

`alter table <t> enable row level security;` on all seven new tables.

| Table | select | insert | update | delete |
|---|---|---|---|---|
| `locations` | `company_id = get_my_company_id()` | same | same (USING + WITH CHECK) | `company_id = get_my_company_id() and is_company_owner()` |
| `vendors` | same | same | same | same (owner-only) |
| `category_default_vendors` | same | same + `exists(vendor of same company)` and `exists(equipment_type of same company)` | same | `company_id = get_my_company_id()` (any staff) |
| `dispatches` | `company_id = get_my_company_id()` | **no policy** (created only by the SECURITY DEFINER RPC) | **no policy** | **no policy** |
| `staff_badges` | `company_id = get_my_company_id()` | same | same | owner-only |
| `equipment_access` | `company_id = get_my_company_id()` | **no policy** | **no policy** | **no policy** |
| `site_pin_passes` | `company_id = get_my_company_id()` | **no policy** | **no policy** | **no policy** |

Notes that matter:

- `category_default_vendors` insert/update **must** re-check that `vendor_id` and
  `equipment_type_id` belong to `get_my_company_id()` — neither FK is tenant-constrained,
  and `resolve_qr_code()` publishes an equipment type's whole guide graph publicly.
  Copy the `exists(...)` shape used by the 0019 `inspections` insert policy.
- There is **no company-kind check in any policy.** Tenancy is the security boundary; a
  provider creating a `vendors` row is a harmless no-op, and a kind check in RLS would
  break the moment a company changes kind.
- No policy anywhere else in the database is modified by this build.

#### 2.1.14 Grants

Tables: nothing new — the shim/Supabase default privileges plus RLS cover staff access.
Functions: every function created in §2.2 gets an explicit
`revoke execute on function … from public;` followed by exactly the grant listed in its
row of §2.2.7. State the grants in the file even where `create or replace` would have
preserved them (0018's rule: the file alone must describe who may call it).

### 2.2 `0025_owner_rpcs.sql`

Every function: `language plpgsql`, `security definer`, `set search_path = public`.
Only `resolve_qr_code` and `get_vendor_dispatch`-adjacent readers may be `stable`; anything
that writes must not be. All of them resolve the tenant server-side and never accept a
company id from the caller.

#### 2.2.1 `resolve_qr_code(p_token text) returns json` — v5

`create or replace`, same signature, **the 0023 body plus new keys only**. Do not remove,
rename or reorder a single existing key; `src/lib/types.ts EquipmentGuide` and four pages
depend on them.

Added to `guide`:

| Key | Value |
|---|---|
| `company.kind` | `companies.kind` |
| `equipment_type.symptom_chips` | `et.symptom_chips` (always an array, `'{}'` when unset) |
| `location` | `null`, or `{"id": …, "name": …}` from `equipment.location_id`. **Name only.** No address, no phone, no hours, no `site_pin`. |
| `site_pin_required` | `boolean` — true iff `c.kind = 'equipment_owner'` **and** the unit's location has a non-null `site_pin` |

**Vendor details are NOT exposed by `resolve_qr_code`.** The sticker is physically public;
publishing a vendor's dispatch phone/email to anyone who walks past a machine is a spam
and social-engineering vector, and the concept doc only promises the "call now" affordance
*on the confirmation screen*. The vendor's name and phone come back from
`submit_owner_service_request()` — i.e. only after a real submission that has already
passed the PIN gate when one is configured. The vendor's **email** is never returned to a
non-service-role caller at all.

`site_pin_required` leaks only the fact that a PIN exists, which the poster on the wall
already says.

#### 2.2.2 `verify_site_pin(p_qr_token text, p_pin text) returns json`

Resolve the code with `find_qr_code()` → equipment → location. If the company is not
`equipment_owner`, or the location has no `site_pin`, return
`{"ok": true, "pass": null, "location_name": …}` (nothing to verify).

Rate limits, **checked before the comparison**, both through `check_rate_limit()` (which
the function may call because a SECURITY DEFINER function runs as its owner — the same
trick `add_customer_request_update` uses):

- `check_rate_limit('pin:loc:' || v_location_id::text, 30, 3600)`
- `check_rate_limit('pin:tok:' || p_qr_token, 15, 3600)`

Either failing → `raise exception … using errcode = '54000'`.

Compare with a constant-time-ish equality (`v_location.site_pin = btrim(p_pin)` is
acceptable here — this is a 4–8 digit shared code, not a password hash) and return:

- match → `{"ok": true, "pass": "<48 hex>", "location_name": …}` after inserting a
  `site_pin_passes` row (default 30-day expiry) and returning its `token`;
- mismatch → `{"ok": false, "pass": null, "location_name": null}`. **Never** echo the PIN,
  its length, or any hint.

Unknown token → `{"ok": false, "pass": null, "location_name": null}` (no oracle for
whether a sticker exists).

#### 2.2.3 `submit_owner_service_request(...) returns json`

```sql
submit_owner_service_request(
  p_qr_token        text,
  p_description     text,
  p_contact_name    text,
  p_reporter_phone  text    default null,
  p_symptoms        text[]  default '{}'::text[],
  p_priority        text    default 'normal',
  p_media           jsonb   default '[]'::jsonb,
  p_pin_pass        text    default null
) returns json
```

A **new** function, not an overload of `submit_service_request` — that one keeps its exact
8-argument signature and body and stays the provider path. (0010 exists because a stale
overload broke PostgREST; do not repeat it.)

Behaviour, in order:

1. `v_code := find_qr_code(p_qr_token)`; null or no `equipment_id` → `raise … 'Unknown equipment'`.
2. Load equipment + company. `companies.kind <> 'equipment_owner'` → errcode **`P0003`**,
   message `This code belongs to a service company` (the caller should use the provider form).
3. Validate `p_description` 1–4000 chars and `p_contact_name` 1–120 chars, else `22023`.
4. PIN gate: if the unit's location has a `site_pin`, require a `site_pin_passes` row where
   `token = p_pin_pass and location_id = <the unit's location> and expires_at > now()`; miss →
   errcode **`P0004`**, message `A site code is required`. Stamp `last_used_at = now()`.
5. `check_rate_limit('osr:rpc:' || v_code.id::text, 30, 3600)` → `54000` when exceeded
   (the API route also limits by IP and token; this is the backstop against a direct
   anon-key call).
6. Coerce priority: `case when p_priority in ('low','normal','high') then p_priority else 'normal' end`.
   **`'urgent'` is never accepted from this path** — same rule as the provider form.
7. Insert `service_requests` with: `source = 'scan'`, `company_id`/`equipment_id`/`customer_id`
   from the unit, `location_id = equipment.location_id`, `contact_name = p_contact_name`,
   `contact_phone = nullif(btrim(p_reporter_phone),'')`, `reporter_phone` = the same value,
   `contact_email = null`, `requires_approval = false`, `approved_at = now()`,
   `troubleshooting_path` = `p_symptoms` mapped to
   `[{"question":"Symptom","answer":"<chip>"} …]` (cap 12 entries, each ≤ 120 chars).
   The chips go **only** there — do not also splice them into `description`.
8. Media loop: identical to `submit_service_request` (one `service_request_media` row per
   `p_media` entry). The API route is responsible for the `<qrToken>/…` prefix check.
9. `equipment_events` row: `kind='request_submitted'`, `actor_kind='customer'`,
   `details = {priority, media_count, symptom_count}`.
10. `request_activity` row: `kind='status_change'`, `visibility='customer'`,
    `author_kind='system'`, body `'Request received'`.
11. **Vendor resolution**, in this precedence, returning a `vendor_source` string:
    - `'warranty'` — `equipment.warranty_vendor_id` is not null **and**
      `equipment.warranty_ends_on >= current_date`;
    - `'unit'` — `equipment.vendor_id`;
    - `'category'` — `category_default_vendors` for `(company_id, equipment.equipment_type_id)`;
    - `'none'`.
    Any resolved vendor with `active = false` is treated as `'none'`.
12. If a vendor resolved **and** has a non-null `email`: insert one `dispatches` row
    (`channel='email'`, `status='sent'`, `sent_at` left **null** — the route stamps it),
    and one `request_activity` row `kind='dispatch'`, `visibility='customer'`,
    `author_kind='system'`, body `'Sent to <vendor name>'`,
    metadata `{"action":"created","vendor_id":…,"vendor_name":…,"dispatch_id":…}`.
    Otherwise create no dispatch.
13. Return:

```jsonc
{
  "request_id": "…", "public_token": "…",
  "company_id": "…", "company_name": "…",
  "company_notification_email": "…|null",   // service role ONLY (is_service_role())
  "company_phone": "…", "company_logo_path": "…", "company_brand_color": "…",
  "customer_updates_enabled": true,
  "equipment_id": "…", "equipment_name": "…",
  "location_name": "…|null",
  "vendor_source": "warranty|unit|category|none",
  "vendor": { "id": "…", "name": "…", "phone": "…|null" } | null,   // anon-visible
  "vendor_email":   "…|null",               // service role ONLY
  "dispatch_id":    "…|null",               // service role ONLY
  "dispatch_token": "…|null"                // service role ONLY — see below
}
```

`dispatch_token` gated on `is_service_role()` is **load-bearing**: the person who just
filed the report must never receive the token that lets them act *as the vendor*.

#### 2.2.4 Vendor-token RPCs (`/v/<token>`)

Shared preamble for all of them: look the dispatch up by `token`; not found → errcode
**`P0002`** (`Request not found`). Reject when `dispatches.status = 'declined'` or the
parent `service_requests.status in ('resolved','canceled')` → errcode **`P0001`**
(`This request is closed`). Then
`check_rate_limit('vd:' || v_dispatch.id::text, 60, 3600)` → `54000`.

Every write appends **one** `request_activity` row: `kind='dispatch'`,
`visibility='customer'`, `author_kind='vendor'`, `author_user_id = null`,
`metadata = {"action":"<action>","vendor_id":…,"vendor_name":…,"dispatch_id":…, …}` and
returns the owner-notification payload (service-role-gated fields marked ⚑).

| Function | Signature | Effect | Returns |
|---|---|---|---|
| `get_vendor_dispatch` | `(p_token text) returns json` | On first call only: `viewed_at = now()`, `status = 'viewed'` when currently `'sent'`. Not `stable`. | Payload below |
| `vendor_acknowledge_dispatch` | `(p_token text, p_note text default null) returns json` | `status='acknowledged'`, `acknowledged_at=now()`; if the request is `'new'`, set it to `'in_progress'`. Body: `"<vendor> acknowledged the work order"` | notify payload |
| `vendor_set_dispatch_eta` | `(p_token text, p_eta_at timestamptz, p_note text default null) returns json` | Reject `p_eta_at` null, in the past, or > 90 days out (`22023`). `eta_at`, `status='eta_given'`, `acknowledged_at = coalesce(acknowledged_at, now())`. metadata carries `eta_at`. | notify payload |
| `vendor_add_dispatch_note` | `(p_token text, p_body text) returns json` | 2–2000 chars (`22023`). Appends to `vendor_notes` (newline-joined, cap 8000). **Status unchanged.** | notify payload |
| `vendor_finish_dispatch` | `(p_token text, p_note text default null) returns json` | `status='finished'`, `finished_at=now()`. **Does not touch `service_requests.status`.** | notify payload |
| `vendor_decline_dispatch` | `(p_token text, p_reason text) returns json` | Only from `sent`/`viewed`/`acknowledged`/`eta_given` (else `P0001`). 2–500 chars. `status='declined'`, `declined_at`, `decline_reason`. | notify payload |
| `vendor_attach_dispatch_invoice` | `(p_token text, p_storage_path text) returns json` | **service_role only.** `p_storage_path` must match `'<company_id>/dispatch-invoices/<dispatch_id>/%'` exactly, else `22023`. Sets `invoice_path`, `invoice_uploaded_at`. | notify payload |

`get_vendor_dispatch` payload — exactly these keys, nothing more:

```jsonc
{
  "dispatch": { "id","status","eta_at","vendor_notes","decline_reason",
                "invoice_path","sent_at","acknowledged_at","finished_at","created_at" },
  "vendor":   { "id","name","account_number","ack_sla_minutes" },
  "owner":    { "company_name","phone","contact_email","timezone" },   // contact_email = companies.notification_email
  "request":  { "public_token","status","priority","description","created_at",
                "contact_name","reporter_phone","symptoms":["…"] },
  "equipment":{ "name","make","model","serial_number","location","status",
                "warranty_ends_on","in_warranty": bool },
  "location": { "name","address","phone","hours" },
  "media":    [ { "index": 0, "media_type": "image|video" } ],   // NO storage_path
  "activity": [ { "kind","body","author_kind","author_name","created_at" } ]  // visibility='customer' only
}
```

Never in this payload: `site_pin`, `cost_cents`, internal `request_activity` rows, any
other request or unit, any other dispatch, any `profiles` row, `vendors.email`, storage
paths. `media` is index-only; the bytes come from the route in §3.3.

`owner.contact_email` is `companies.notification_email` and **is** exposed here. That is
deliberate and token-scoped: the vendor already received that address as the dispatch
email's `Reply-To`, and a vendor standing in a kitchen needs a way to reach the owner.
Record it in the security review.

#### 2.2.5 `mark_dispatch_sent(p_dispatch_id uuid, p_ok boolean, p_error text default null) returns void`

Service role only. `p_ok` → `sent_at = coalesce(sent_at, now())`. Otherwise
`status = 'failed'`, `last_error = left(p_error, 500)`. Idempotent.

#### 2.2.6 `claim_dispatch_sla_alerts(p_claim_stamp timestamptz, p_limit int default 50) returns setof json`

Service role only. One atomic claiming `UPDATE … RETURNING` (the `visit-reminders` pattern,
but done in SQL so overlapping cron runs cannot both claim a row):

```sql
update dispatches d
set sla_alerted_at = p_claim_stamp
where d.id in (
  select d2.id
  from dispatches d2
  join vendors v on v.id = d2.vendor_id
  join service_requests sr on sr.id = d2.service_request_id
  where d2.sla_alerted_at is null
    and d2.status in ('sent', 'viewed')
    and d2.sent_at is not null
    and d2.sent_at < now() - make_interval(mins => v.ack_sla_minutes)
    and sr.status not in ('resolved', 'canceled')
  order by d2.sent_at
  limit p_limit
  for update of d2 skip locked
)
returning …
```

Each returned row: `{ dispatch_id, company_id, company_name, company_notification_email,
company_timezone, vendor_name, vendor_phone, ack_sla_minutes, minutes_overdue,
equipment_name, location_name, request_public_token, request_id, request_priority }`.

The cron releases a failed send by setting `sla_alerted_at = null` **where
`sla_alerted_at = <the stamp it passed in>`** — which is why the stamp is an argument and
not `now()` per row.

#### 2.2.7 Grants — the complete table

| Function | `revoke from public` | grant to |
|---|---|---|
| `resolve_qr_code(text)` | yes | `anon, authenticated` |
| `verify_site_pin(text, text)` | yes | `anon, authenticated, service_role` |
| `submit_owner_service_request(text,text,text,text,text[],text,jsonb,text)` | yes | `anon, authenticated, service_role` |
| `get_vendor_dispatch(text)` | yes | `anon, authenticated, service_role` |
| `vendor_acknowledge_dispatch(text,text)` | yes | `anon, authenticated, service_role` |
| `vendor_set_dispatch_eta(text,timestamptz,text)` | yes | `anon, authenticated, service_role` |
| `vendor_add_dispatch_note(text,text)` | yes | `anon, authenticated, service_role` |
| `vendor_finish_dispatch(text,text)` | yes | `anon, authenticated, service_role` |
| `vendor_decline_dispatch(text,text)` | yes | `anon, authenticated, service_role` |
| `vendor_attach_dispatch_invoice(text,text)` | yes | **`service_role` only** |
| `mark_dispatch_sent(uuid,boolean,text)` | yes | **`service_role` only** |
| `claim_dispatch_sla_alerts(timestamptz,int)` | yes | **`service_role` only** |
| `dispatches_sync_request()` | `public, anon, authenticated` | (trigger only) |
| `enforce_location_limit()` | `public, anon, authenticated` | (trigger only) |
| `create_company_and_profile(text,text,text)` and `(text,text,text,text)` | yes | `authenticated` |
| `get_company_entitlements()` | — (unchanged) | `authenticated` |
| `get_company_plan_flags(uuid)` | yes | `anon, authenticated` |

Add a `comment on function …` to every new function, one sentence, saying who may call it
and what it is rate-limited by — the 0019 style.

---

## 3. Per-workstream manifests

Branching (fixed): `feat/owner-schema` off `main`; `feat/owner-dashboard`,
`feat/owner-dispatch`, `feat/owner-billing-marketing` each off `feat/owner-schema`.
WS2/3/4 run in parallel and merge in that order.

**The governing seam rule: any file two workstreams both need lives in WS1's manifest and
is finished (not stubbed) there.** WS2/3/4 import it; they never create it.

### 3.1 WS1 — `feat/owner-schema`

No pages, no dialogs, no server actions.

**Create**

| Path | Contents |
|---|---|
| `supabase/migrations/0024_owner_foundation.sql` | §2.1 |
| `supabase/migrations/0025_owner_rpcs.sql` | §2.2 |
| `scripts/local-db/smoke-owner.sql` | §6.1 |
| `src/lib/vocab.ts` | §3.1.1 |
| `src/lib/dispatch.ts` | §3.1.2 |
| `src/components/dispatch-status-badge.tsx` | §3.1.3 — the one UI file WS1 owns, because WS2 and WS3 both render it from sibling branches |

**Modify (append-only where noted)**

| Path | Change |
|---|---|
| `src/lib/types.ts` | append every type in §3.1.4; extend `UserRole`, `Company`, `Equipment`, `EquipmentType`, `ServiceRequest`, `EquipmentGuide`, `CompanyPublicProfile` in place (add fields only) |
| `src/lib/plans.ts` | §3.1.5 — constants, types, owner plan rows, `canAddLocation`. **Not** the Stripe price map (WS4) |
| `src/lib/rate-limit.ts` | append the six buckets in §3.1.6 |
| `src/lib/features.ts` | add `ownerAccounts: flag(process.env.NEXT_PUBLIC_FEATURE_OWNER_ACCOUNTS, true)` with a doc comment |
| `src/lib/events.ts` | append `dispatch_sent: "Dispatched to vendor"` and `dispatch_update: "Vendor update"` to `EQUIPMENT_EVENT_KINDS`; add `"dispatch"` to `RequestActivityKind` (in `types.ts`) and `"vendor"` to `ActorKind` |
| `src/lib/email/layout.ts` | append `sanitizeEmailSubject(value: string, max = 140): string` and `sanitizeEmailHeader(value: string): string \| null` — §7 |
| `src/lib/qr.ts` | append `getVendorDispatchUrl(dispatchToken: string): string` → `${serverEnv.NEXT_PUBLIC_APP_URL}/v/${dispatchToken}` |
| `docs/API.md` | append an "Owner accounts" section listing every RPC in §2.2 with its signature, grant and error codes |

#### 3.1.1 `src/lib/vocab.ts` (exact shape)

```ts
import type { CompanyKind } from "@/lib/types";

export type Vocab = {
  requestSingular: string;       // "Service request" | "Work order"
  requestPlural: string;         // "Service requests" | "Work orders"
  requestsNavLabel: string;      // "Requests" | "Work Orders"
  requestsHref: string;          // "/dashboard/requests" for both kinds
  counterpartySingular: string;  // "Customer" | "Vendor"
  counterpartyPlural: string;    // "Customers" | "Vendors"
  counterpartyHref: string;      // "/dashboard/customers" | "/dashboard/vendors"
  reporterNoun: string;          // "Customer" | "Staff member"
  assigneeNoun: string;          // "Technician" | "Vendor"
  siteSingular: string;          // "Site" | "Location"
  sitePlural: string;            // "Sites" | "Locations"
  newRequestVerb: string;        // "Report a problem" | "Report a problem"
};

export const VOCAB: Record<CompanyKind, Vocab> = { /* both filled in */ };
/** Falls back to service_provider for a null/unknown kind — never throws. */
export function vocabFor(kind: CompanyKind | null | undefined): Vocab;
```

#### 3.1.2 `src/lib/dispatch.ts`

```ts
export const DISPATCH_STATUS_LABELS: Record<DispatchStatus, string> = {
  pending_approval: "Waiting for approval",
  sent: "Sent to vendor",
  viewed: "Vendor opened it",
  acknowledged: "Vendor acknowledged",
  eta_given: "ETA given",
  finished: "Vendor marked finished",
  declined: "Vendor declined",
  failed: "Couldn't send",
};
export const DISPATCH_STATUS_ORDER: DispatchStatus[];
/** Terminal for the vendor: declined | finished. */
export function isVendorActionable(status: DispatchStatus): boolean;
/** "Metro Refrigeration · ETA Tue 3:15 PM" style one-liner for a list row. */
export function dispatchSummary(input: {
  status: DispatchStatus; vendorName: string | null; etaAt: string | null; timeZone: string | null;
}): string;
export type VendorAction =
  | "acknowledge" | "eta" | "note" | "finish" | "decline" | "invoice";
export const VENDOR_ACTION_PAST_TENSE: Record<VendorAction, string>;
// acknowledge: "acknowledged the work order", eta: "gave an ETA",
// note: "added a note", finish: "marked the work finished",
// decline: "declined the work order", invoice: "attached an invoice"
```

#### 3.1.3 `src/components/dispatch-status-badge.tsx`

Server-safe (no `"use client"`, no hooks). Props are frozen:

```tsx
export function DispatchStatusBadge(props: {
  status: DispatchStatus | null;
  vendorName?: string | null;
  etaAt?: string | null;
  timeZone?: string | null;
  className?: string;
}): React.ReactElement | null;
```

`status === null` renders `null` (a provider-kind request has no dispatch). Colours follow
`src/components/status-badge.tsx`'s `<Badge>` conventions: `failed`/`declined` destructive,
`finished` emerald, `acknowledged`/`eta_given` sky, `sent`/`viewed` muted.

#### 3.1.4 New types in `src/lib/types.ts`

`CompanyKind`, `DispatchChannel`, `DispatchStatus`, `EquipmentRelationship`, `Location`,
`Vendor`, `CategoryDefaultVendor`, `Dispatch`, `StaffBadge`, `EquipmentAccess`,
`VendorDispatchView` (the §2.2.4 payload), `OwnerSubmitResult` (the §2.2.3 payload),
`SitePinVerifyResult`, `DispatchSlaAlert` (the §2.2.6 row).
In-place field additions: `UserRole` → `"owner" | "manager" | "technician" | "staff"`;
`Company.kind`, `Company.owner_setup_completed_at`; `Equipment.location_id|vendor_id|warranty_vendor_id`;
`EquipmentType.symptom_chips: string[]`; `ServiceRequest.requires_approval|approved_at|approved_by|cost_cents|reporter_phone|location_id|dispatch_status|dispatch_id`;
`EquipmentGuide.site_pin_required?: boolean`, `.location?: {id,name} | null`,
`EquipmentGuide.equipment_type.symptom_chips?: string[]`, `CompanyPublicProfile.kind?: CompanyKind`;
`ActorKind` += `"vendor"`; `RequestActivityKind` += `"dispatch"`.
Mark every new `EquipmentGuide` field optional — cached payloads predate the migration.

#### 3.1.5 `src/lib/plans.ts` (WS1's half)

```ts
export type ProviderPlanId = "starter" | "pro" | "business";
export type OwnerPlanId = "free" | "site" | "multi_site";
export type PlanId = ProviderPlanId | OwnerPlanId;

export type Plan = { /* existing fields */
  kind: CompanyKind;
  /** Owner plans only; null = unlimited / not applicable. */
  locationLimit: number | null;
  /** Display-only retention hint. Nothing enforces it. */
  historyDays: number | null;
};

export const plans: Plan[]        // UNCHANGED name + contents (3 provider plans, kind:"service_provider")
export const ownerPlans: Plan[]   // free / site / multi_site
export const allPlans: Plan[]     // [...plans, ...ownerPlans]
export function plansFor(kind: CompanyKind): Plan[]
export function getPlan(id: PlanId): Plan      // searches allPlans
export function isPlanId(v): v is PlanId       // over allPlans
export function canAddLocation(plan: Plan, currentCount: number): boolean
export const TRIAL_PLAN_BY_KIND: Record<CompanyKind, PlanId> =
  { service_provider: "pro", equipment_owner: "site" };
export const FREE_PLAN_BY_KIND: Record<CompanyKind, PlanId> =
  { service_provider: "starter", equipment_owner: "free" };
```

`plans` keeps its exact current name and its three provider entries because
`src/app/(marketing)/pricing/page.tsx`, `_components/pricing-cards.tsx` and
`dashboard/settings/billing/plan-cards.tsx` iterate it. `TRIAL_DAYS` and `TRIAL_PLAN` stay.

Owner plan values, exactly:

| id | name | priceMonthly | priceYearly | equipmentLimit | memberLimit | locationLimit | historyDays | features |
|---|---|---|---|---|---|---|---|---|
| `free` | Free | 0 | 0 | 10 | `null` | 1 | 30 | aiChat `false`, batchQr `false`, branding `false`, exportApi `false` |
| `site` | Site | 24 | 240 | 75 | `null` | 1 | `null` | aiChat `true`, batchQr `true`, branding `false`, exportApi `false` |
| `multi_site` | Multi-site | 69 | 690 | 400 | `null` | 5 | `null` | aiChat `true`, batchQr `true`, branding `true`, exportApi `false` |

`memberLimit: null` everywhere — **requester/staff seats are free and unlimited at every
owner tier.** `site` is `popular: true`.

Blurbs / highlights: write them, keep them factual, no customer or stat claims.

#### 3.1.6 `src/lib/rate-limit.ts` additions (append, exact keys)

```ts
/** POST /api/site-pin — per client IP. */
sitePinPerIp: { limit: 30, windowSeconds: 60 * 60 },
/** POST /api/owner-requests — per client IP. */
ownerRequestPerIp: { limit: 10, windowSeconds: 60 * 60 },
/** POST /api/owner-requests — per QR token. */
ownerRequestPerToken: { limit: 20, windowSeconds: 60 * 60 },
/** POST /api/vendor-actions — per client IP. */
vendorActionPerIp: { limit: 60, windowSeconds: 60 * 60 },
/** POST /api/vendor-actions and /v/<token> renders — per dispatch token. */
vendorActionPerToken: { limit: 60, windowSeconds: 60 * 60 },
/** POST /api/vendor-invoice — per dispatch token. */
vendorInvoicePerToken: { limit: 10, windowSeconds: 60 * 60 },
```

### 3.2 WS2 — `feat/owner-dashboard` (base `feat/owner-schema`)

**Create**

| Path | What |
|---|---|
| `src/lib/owner-templates.ts` | `RESTAURANT_EQUIPMENT_TEMPLATES` — §5.1 content verbatim |
| `src/app/dashboard/locations/page.tsx` | Locations list (name, address, units, PIN set?, active) + `<NewLocationDialog>` |
| `src/app/dashboard/locations/new-location-dialog.tsx` | |
| `src/app/dashboard/locations/[id]/page.tsx` | Edit form, units at this location, PIN card, "Print staff poster" link |
| `src/app/dashboard/locations/[id]/edit-location-form.tsx` | |
| `src/app/dashboard/locations/[id]/site-pin-card.tsx` | Set / change / clear the PIN; shows it in plain text to staff; copy button |
| `src/app/dashboard/locations/[id]/poster/page.tsx` | Print-friendly staff poster (location name, PIN, "scan the tag on the machine" steps). `print:` classes only, no new deps |
| `src/app/dashboard/locations/actions.ts` | `createLocation`, `updateLocation`, `setSitePin`, `clearSitePin`, `deactivateLocation`, `deleteLocation` |
| `src/app/dashboard/vendors/page.tsx` | Vendors list (name, categories, phone, email, SLA, units served) + `<NewVendorDialog>` |
| `src/app/dashboard/vendors/new-vendor-dialog.tsx` | |
| `src/app/dashboard/vendors/[id]/page.tsx` | Edit form + `<CategoryDefaultsEditor>` + units assigned to this vendor + recent dispatches (read-only) |
| `src/app/dashboard/vendors/[id]/edit-vendor-form.tsx` | |
| `src/app/dashboard/vendors/[id]/category-defaults-editor.tsx` | Per-equipment-type toggle "default vendor for this category" |
| `src/app/dashboard/vendors/actions.ts` | `createVendor`, `updateVendor`, `deactivateVendor`, `deleteVendor`, `setCategoryDefault`, `clearCategoryDefault` |
| `src/app/dashboard/onboarding/owner/page.tsx` | Two-step owner first-run wizard |
| `src/app/dashboard/onboarding/owner/owner-setup-flow.tsx` | Step 1 first location; step 2 "Add the standard restaurant equipment types" |
| `src/app/dashboard/onboarding/owner/actions.ts` | `createFirstLocation`, `seedRestaurantEquipmentTypes`, `finishOwnerSetup` |
| `src/app/dashboard/equipment/vendor-select.tsx` | Reusable `<VendorSelect name kind vendors categoryDefault>` |

**Modify**

| Path | Change |
|---|---|
| `src/app/(auth)/signup/signup-form.tsx` | Kind step (§3.2.1) |
| `src/app/(auth)/onboarding/page.tsx` | Same two-choice control; call the 4-arg RPC |
| `src/app/dashboard/layout.tsx` | Read `meta.pending_company_kind` (validate against the two literals, default `service_provider`), call the 4-arg RPC; pass `kind={company?.kind ?? "service_provider"}` to `<DashboardNav>` / `<DashboardTopNav>`; redirect owner-kind companies with `owner_setup_completed_at is null` to `/dashboard/onboarding/owner` (never from that route itself, never when locked) |
| `src/components/dashboard-nav-links.ts` | Append `ownerNavLinks` + `navLinksFor(kind)`; leave `dashboardNavLinks` untouched (its test asserts on it) |
| `src/components/dashboard-nav.tsx`, `dashboard-topnav.tsx` | New required prop `kind: CompanyKind`; use `navLinksFor(kind)` |
| `src/components/dashboard-nav-links.test.ts` | Append owner-nav assertions |
| `src/app/dashboard/equipment/new-equipment-dialog.tsx`, `[id]/edit-equipment-form.tsx` | Owner-kind: `locationId` select (from `locations`), `vendorId` select with **"Use category default (<name>)"** as the pre-selected option (value `""`), optional `warrantyVendorId` select shown only when `warrantyEndsOn` is set. Provider-kind: unchanged |
| `src/app/dashboard/equipment/actions.ts` | `patchFromForm` gains `location_id`, `vendor_id`, `warranty_vendor_id`; `assertOwnedReferences` gains the same `exists`-check treatment as `equipment_type_id` / `customer_id` (these FKs are not tenant-constrained) |
| `src/app/dashboard/equipment/page.tsx`, `equipment-filters.tsx` | Owner-kind: "Customer" column/filter → "Location"; add a "Vendor" column |
| `src/app/dashboard/requests/page.tsx` | Owner-kind: title from `vocab.requestPlural`; "Customer" column → "Location"; new "Dispatch" column rendering `<DispatchStatusBadge status={r.dispatch_status} vendorName={…} etaAt={…} />`; filter `dispatch=<status>` |
| `src/app/dashboard/requests/[id]/page.tsx` | **One import line + one JSX line** mounting WS3's `<DispatchPanel requestId={request.id} companyKind={company.kind} />` under the existing status card. Nothing else in this file |
| `src/app/dashboard/page.tsx` | Owner-kind overview counts: open work orders, units, locations, vendors; "N dispatches with no vendor response" card |
| `src/app/dashboard/customers/page.tsx` | Owner-kind: render an `<EmptyState>` explaining vendors live at `/dashboard/vendors` (do **not** delete the route) |
| `docs/TEAMS.md` | Document `manager` (§3.2.2) |

**Manager role (§3.2.2)** — trivial, so it ships: allow `"manager"` in
`src/app/dashboard/settings/team/actions.ts` (`inviteMember`'s role validation and
`updateMemberRole`), add the option to `invite-member-dialog.tsx` and a label in
`members-table.tsx` and `src/lib/email/invite.ts`. **No RLS or entitlement change**:
`is_company_owner()` stays owner-only, so in Phase 1 a manager has exactly a
technician's permissions with a different label. Say that in the dialog's help text.
`"staff"` must not be selectable anywhere.

**Owner nav (`ownerNavLinks`), in order**

`Overview` `/dashboard` · `Locations` `/dashboard/locations` (MapPin) ·
`Equipment` `/dashboard/equipment` (HardHat) · `Equipment Types` `/dashboard/equipment-types` (Wrench) ·
`Work Orders` `/dashboard/requests` (Inbox) · `Vendors` `/dashboard/vendors` (Truck) ·
`Team` `/dashboard/settings/team` (ownerOnly) · `Billing` (ownerOnly) · `Settings` (ownerOnly).

**Hidden from owner-kind: `Customers`, `Schedule`, `Checklists`** (and `/dashboard/maintenance`,
which is already only reachable from Schedule). Rationale: Schedule is built around
assigning internal technicians to visits, which owner-kind has none of; Checklists /
inspections are a technician-at-the-machine flow, and PM-that-dispatches is Phase 2. The
routes keep working if typed directly — only the nav hides them.

**Equipment Types stays visible for owners** even though the fixed nav list did not name
it: `symptom_chips` are edited there, and without it an owner cannot change the chips the
seed created.

#### 3.2.1 Sign-up kind step

One page, not a new route. Before the existing fields, render two large radio cards:

- **"I service equipment for customers"** → `service_provider` — "You run a repair or
  service business. Tag your customers' equipment and take in work requests."
- **"I own equipment that other people service"** → `equipment_owner` — "You run a
  restaurant, café, bar or shop. Tag your own equipment so any staff member can send a
  work order to the right vendor."

Default `service_provider`. `?kind=owner` / `?kind=provider` on the URL preselects (the
`/restaurants` page links with `?kind=owner`). Hidden entirely when `?invite=` is present.
The chosen value goes into `signUp(... options.data.pending_company_kind)` alongside the
existing `pending_*` keys. The copy on the card headers changes with the choice
("Set up EquipQR for your service company" / "…for your business").

### 3.3 WS3 — `feat/owner-dispatch` (base `feat/owner-schema`)

**Create**

| Path | What |
|---|---|
| `src/app/e/[qrToken]/owner/owner-scan-actions.tsx` | Owner-kind replacement for the action list: "Report a problem" primary, "Already reported" card above it (reuse `<OpenRequestsCard>` from `../open-request-card` **unchanged**), no "Call us"/"Text us" rows (the owner company has no customer phone story — the vendor's number appears after submit) |
| `src/app/e/[qrToken]/owner/site-pin-gate.tsx` | Client: numeric keypad input, posts `/api/site-pin`, stores the returned pass in `localStorage` under `sitePinStorageKey(locationId)`, never stores the PIN |
| `src/app/e/[qrToken]/owner/owner-report-form.tsx` | The owner report form (§3.3.1) |
| `src/app/e/[qrToken]/owner/owner-confirmation.tsx` | Confirmation screen (§3.3.2) |
| `src/app/api/site-pin/route.ts` | `POST { qrToken, pin }` → rate-limit `sitePinPerIp` → admin client → `verify_site_pin` → `{ ok, pass, locationName }` |
| `src/app/api/owner-requests/route.ts` | §3.3.3 |
| `src/app/api/vendor-actions/route.ts` | §3.3.4 |
| `src/app/api/vendor-invoice/route.ts` | §3.3.5 |
| `src/app/v/[token]/page.tsx` | Vendor page (§3.3.6) |
| `src/app/v/[token]/vendor-actions-panel.tsx` | Client: the six buttons |
| `src/app/v/[token]/not-found.tsx` | "This link is no longer active" |
| `src/app/v/[token]/media/[index]/route.ts` | Signed-URL redirect for a dispatch photo (§3.3.7) |
| `src/app/api/cron/dispatch-sla/route.ts` | §3.3.8 |
| `src/app/dashboard/requests/[id]/dispatch-panel.tsx` | Server component: dispatch timeline, vendor card with `tel:` link, "Resend to vendor" (owner/manager only), invoice download link. Props frozen: `{ requestId: string; companyKind: CompanyKind }` |
| `src/app/dashboard/requests/dispatch-actions.ts` | `resendDispatch(requestId)`, `dispatchToVendor(requestId, vendorId)` for a request that has none |
| `src/lib/email/vendor-dispatch.ts` | `buildVendorDispatchEmail` |
| `src/lib/email/owner-notifications.ts` | `buildOwnerNewRequestEmail`, `buildOwnerNoVendorEmail`, `buildOwnerDispatchUpdateEmail` |
| `src/lib/email/dispatch-sla.ts` | `buildDispatchSlaAlertEmail` |

**Modify**

| Path | Change |
|---|---|
| `src/app/e/[qrToken]/page.tsx` | One branch: when `guide.company.kind === "equipment_owner"` and not staff, render `<OwnerScanActions …>` instead of `<ScanActions …>`. Everything else (photo, header, custom fields, staff detection, `record_scan`, `PoweredBy`) untouched. **WS2 does not touch this file.** |
| `src/app/e/[qrToken]/request/page.tsx` | Same branch: owner-kind renders `<OwnerReportForm>`, provider-kind keeps `<ServiceRequestForm>` |
| `src/lib/public-request.ts` | Append `OWNER_PRIORITY_CHOICES`, `ownerServiceRequestSchema`, `vendorActionSchema`, `sitePinSchema`, `sitePinStorageKey(locationId)`, `MAX_SYMPTOMS = 12` |
| `src/lib/public-request.test.ts` | Append cases |
| `vercel.json` | Append `{ "path": "/api/cron/dispatch-sla", "schedule": "0 * * * *" }` |
| `docs/EMAILS.md` | Append the four new emails |
| `docs/RUNBOOK.md` | Append a "dispatch didn't go out" section |

#### 3.3.1 Owner report form

Fields, top to bottom, all ≥ 52 px tall, one hand, 375 px:

1. **Symptom chips** — multi-select pills from `guide.equipment_type.symptom_chips`, plus a
   permanent "Something else" chip. At least one chip **or** free text is required.
   If a selected chip matches `/gas smell/i`, render a red inline alert immediately:
   *"If you smell gas, leave the area now and call 911 and your gas utility. Send this
   afterwards."*
2. **What's happening?** — `<Textarea rows={3}>`, optional when a chip is picked, max 4000.
3. **How urgent is this?** — three radios, values map through the existing
   `priorityFromChoice()`:
   - "Not urgent" / "Whenever they're next nearby" → `low`
   - "Soon" / "It's slowing us down" → `normal`
   - **"We can't operate without this"** / "We're down right now" → `high`
   Default: "Soon".
4. **Photo** — camera-first, reuse the `downscaleImage` helper and upload path shape from
   `service-request-form.tsx` verbatim (`<qrToken>/<uuid>-<name>`, max 6, 25 MB).
5. **Your name** — required, max 120.
6. **Your phone (optional)** — "so the vendor can reach you if they need to".

No email field: staff don't have work email. The tracking link is handed over on screen.

PIN gate: when `guide.site_pin_required` is true and `localStorage` holds no unexpired pass
for `guide.location.id`, `<SitePinGate>` renders **instead of** the form and swaps to it on
success. The pass is sent as `pinPass` with the submission; a `P0004` response re-opens the
gate and clears the stored pass.

#### 3.3.2 Confirmation screen

Exact required content, in order:

- ✓ "Sent to **{vendor.name}**" — or, with no vendor, "Sent to **{companyName}**" plus
  "No vendor is set for this unit yet, so your manager was notified instead."
- "**{companyName}** was notified too."
- **Call-now block** when `vendor.phone` exists: a `tel:` button labelled
  "Call {vendor.name} — {phone}", with the line *"If this can't wait, call them. EquipQR
  sends the request; it can't confirm anyone picked it up."* This sentence is a legal
  requirement, not decoration (concept §11, liability framing). Do not soften it.
- The reference code (`requestReference(publicToken)`) and a "Track this request" button
  to `/r/<publicToken>`.
- A small "Add this to your phone" line with the same link as plain text.

The vendor's **email is never shown**.

#### 3.3.3 `POST /api/owner-requests`

Mirror `/api/service-requests` exactly, in this order:

1. `enforceRateLimits([{ ownerRequestPerIp, key: 'osr:ip:<ip>' }, { ownerRequestPerToken, key: 'osr:tok:<token>' }])`.
2. `ownerServiceRequestSchema.safeParse` — same `isOwnedUploadPath` media-prefix rule,
   `symptoms: z.array(z.string().trim().min(1).max(120)).max(12).default([])`,
   `pinPass: z.string().max(200).optional().default("")`, honeypot `website`.
   Require `description.trim() || symptoms.length`.
3. Admin client (`submitClient()` pattern, same warn-once fallback) →
   `submit_owner_service_request`. Map `P0003` → 400 "This code belongs to a service
   company", `P0004` → 403 `{ error, needsPin: true }`, `54000` → 429.
4. `summarizeTroubleshootingPath()` + `set_request_ai_summary` — reuse as-is.
5. If `dispatch_id` and `vendor_email`: build and send the vendor email
   (`replyTo = company_notification_email`), then `mark_dispatch_sent(dispatch_id, sent, error)`.
6. Owner email: `buildOwnerNewRequestEmail` when a dispatch went out, else
   `buildOwnerNoVendorEmail`, to `company_notification_email`.
7. Respond `{ id, publicToken, statusUrl, vendor: { name, phone } | null, dispatched: boolean }`.

Never send anything to the reporter by email (they gave no email address).

#### 3.3.4 `POST /api/vendor-actions`

One route, zod discriminated union on `action`
(`acknowledge | eta | note | finish | decline`), `token` always present.
Rate limits `vendorActionPerIp` (`va:ip:<ip>`) and `vendorActionPerToken` (`va:tok:<token>`).
Admin client → the matching RPC → on success, `buildOwnerDispatchUpdateEmail` to the
returned `company_notification_email`. Error mapping: `P0002` → 404, `P0001` → 409,
`22023` → 400, `54000` → 429.

#### 3.3.5 `POST /api/vendor-invoice`

`multipart/form-data` (`token`, `file`). Limits: 10 MB, content type in
`application/pdf | image/jpeg | image/png`, extension derived from the content type (never
from the filename). Rate limit `vendorInvoicePerToken`. Admin client: resolve the dispatch
by token (via `get_vendor_dispatch`), upload to
`equipment-files/<company_id>/dispatch-invoices/<dispatch_id>/<crypto.randomUUID()>.<ext>`,
then `vendor_attach_dispatch_invoice(token, path)`. **No new storage policy** — the service
role bypasses RLS on write, and the existing 0013 policy
"Staff read own private equipment files" already lets the owner's staff read
`<company_id>/…` back through a signed URL.

#### 3.3.6 `/v/[token]` page

Server component, `export const dynamic = "force-dynamic"`. Anon server client →
`get_vendor_dispatch`. Null → `notFound()`. Per-IP guard with
`checkRateLimit('vp:ip:<ip>', RATE_LIMITS.vendorActionPerIp)` before the lookup, rendering
the same "One moment" card `/r/[token]` uses.

Layout (mobile-first, EquipQR-branded — this is not the owner's branded surface):
header "Work order from {owner.company_name}"; urgency pill; equipment name / make / model /
serial; location name, address (tappable map link), hours; "Ask for {request.contact_name}"
+ `tel:` on `reporter_phone`; account number when set; the symptom list and description;
photo thumbnails; the customer-visible activity thread; then `<VendorActionsPanel>`.

Buttons: **Got it, we're scheduling** · **Here's our ETA** (datetime-local) ·
**Add a note** · **Finished** · **Attach invoice** · **This isn't ours** (decline, requires
a reason). No "close"/"resolve" affordance exists anywhere on this page. When the dispatch
is `finished` or `declined`, the panel renders a read-only summary instead.

Footer: "EquipQR sent you this because {owner.company_name} has you on file as the service
vendor for this equipment." — no growth-loop CTA in Phase 1 (that is Model B).

#### 3.3.7 `GET /v/[token]/media/[index]`

Route handler, `runtime = "nodejs"`. Admin client: resolve the dispatch by token, load the
request's `service_request_media` ordered by `created_at, id`, bounds-check `index` (integer,
`0 <= index < length`), create a **5-minute** signed URL for that object and `302` to it.
Any miss → 404. The vendor never sees a storage path and cannot enumerate the bucket.

#### 3.3.8 `dispatch-sla` cron

`src/app/api/cron/dispatch-sla/route.ts`, `export const runtime = "nodejs"`,
hourly (`"0 * * * *"` in `vercel.json`). Auth **exactly** as `visit-reminders`:

```ts
const expected = serverEnv.CRON_SECRET;
if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`)
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

Then: one `claimStamp = new Date().toISOString()` per run →
`admin.rpc("claim_dispatch_sla_alerts", { p_claim_stamp: claimStamp, p_limit: 50 })` →
for each row build and send `buildDispatchSlaAlertEmail` to `company_notification_email`;
on a failed/declined send, release with
`admin.from("dispatches").update({ sla_alerted_at: null }).eq("id", id).eq("sla_alerted_at", claimStamp)`
so the next hour retries. On success, append a `request_activity` row
(`kind='email_sent'`, `visibility='internal'`, `author_kind='system'`) via
`emitRequestActivity` — a failure there is logged, never released.
Respond `{ candidates, emailsSent, skipped }`.

#### 3.3.9 Emails — exact subjects and required content

All four go through `renderEmail({ heading, bodyHtml, cta, footerNote, brand })` /
`renderEmailText`. Every interpolated user value goes through `escapeHtml()` in HTML and
every subject through `sanitizeEmailSubject()`.

| Helper | To | Subject | Reply-To | Must contain |
|---|---|---|---|---|
| `buildVendorDispatchEmail` | `vendors.email` | `Work order from {ownerName}: {equipmentName} — {firstSymptom or first 60 chars of description}` | **`companies.notification_email`** | Owner company name; location name + address + hours; equipment name/make/model/serial; in-warranty flag when applicable; the symptom list; the description; "reported by {name}" + phone when present; account number when set; photo count; the primary CTA **"Open the work order"** → `getVendorDispatchUrl(token)`; the line "You don't need an account — the link opens a page where you can acknowledge, give an ETA, add a note or attach an invoice." |
| `buildOwnerNewRequestEmail` | `companies.notification_email` | `New work order: {equipmentName} at {locationName} — sent to {vendorName}` | *(none)* | Who reported it and their phone; urgency; symptoms + description; the vendor's name, phone and the fact the dispatch email went out; CTA "Open in EquipQR" → `/dashboard/requests/<id>` |
| `buildOwnerNoVendorEmail` | `companies.notification_email` | `New work order: {equipmentName} at {locationName} — no vendor on file` | *(none)* | Same body, plus "No vendor is assigned to this unit or its category, so nothing was dispatched." and a CTA to `/dashboard/equipment/<id>` |
| `buildOwnerDispatchUpdateEmail` | `companies.notification_email` | `{vendorName} {VENDOR_ACTION_PAST_TENSE[action]}: {equipmentName}` | *(none)* | The action, the vendor note/ETA/decline reason when present (ETA rendered in `companies.timezone` via `formatZonedDateTime`), the equipment + location, CTA to `/dashboard/requests/<id>` |
| `buildDispatchSlaAlertEmail` | `companies.notification_email` | `No response yet from {vendorName} — {equipmentName} at {locationName}` | *(none)* | Minutes since the dispatch was sent; **the vendor's phone number in the first line of the body**; the urgency; CTA to `/dashboard/requests/<id>`; the line "EquipQR can't confirm a vendor received an email — calling is the reliable check." |

Owner emails are staff-facing and therefore **EquipQR-branded** (no `brand` argument) —
the same rule `buildServiceRequestNotificationEmail` already follows. The vendor email is
also EquipQR-branded: the owner's logo is a Pro-plan customer-facing entitlement and the
vendor is not a customer.

### 3.4 WS4 — `feat/owner-billing-marketing` (base `feat/owner-schema`)

**Create**

| Path | What |
|---|---|
| `src/app/(marketing)/restaurants/page.tsx` | Landing page (§3.4.2) |
| `src/app/(marketing)/pricing/audience-tabs.tsx` | Client tabs, URL param `?for=owners\|providers`, default `providers` |
| `src/app/(marketing)/_components/owner-pricing-cards.tsx` | Cards over `ownerPlans` |
| `src/lib/plans.test.ts` | §6.2 |

**Modify**

| Path | Change |
|---|---|
| `src/lib/plans.ts` | **Only** `PRICE_ENV_VARS`, `getStripePriceId`, `listStripePriceEnvVars`, `planFromStripePriceId` (§3.4.1). WS1 already landed everything else |
| `src/lib/billing.ts` | `Entitlements` gains `company_kind`, `location_count`, `max_locations`; `requireActiveSubscription()` returns `null` immediately for `equipment_owner`; new `assertCanAddLocation()` mirroring `assertCanAddEquipment()`; `assertCanAddEquipment()` error copy uses the resolved plan's name either way |
| `src/app/dashboard/settings/billing/page.tsx`, `plan-cards.tsx` | Render `plansFor(company.kind)`; owner view shows units **and** locations used/limit; the `free` card is "Your current plan" with no checkout button |
| `src/components/billing/locked-screen.tsx`, `trial-banner.tsx` | Never render for `equipment_owner` (guard in `dashboard/layout.tsx` too) |
| `src/app/(marketing)/pricing/page.tsx` | Wrap the existing provider table in the tabs; add the owner table + owner FAQ entries |
| `src/app/(marketing)/_components/site-header.tsx` | Append `{ href: "/restaurants", label: "For restaurants" }` to `navLinks` |
| `src/app/(marketing)/_components/faq-data.ts` | Append owner FAQs (free tier, staff seats, what happens if a vendor never clicks) |
| `src/app/sitemap.ts` | Append `/restaurants` |
| `.env.local.example` | The four new Stripe vars + `NEXT_PUBLIC_FEATURE_OWNER_ACCOUNTS` |
| `docs/BILLING.md`, `docs/MARKETING.md`, `README.md` | Append owner-plan sections |
| `e2e/public.spec.ts` | Optional: one assertion that `/restaurants` returns 200 and renders its `<h1>` |

#### 3.4.1 Stripe wiring

```ts
const PRICE_ENV_VARS: Record<Exclude<PlanId, "free">, Record<BillingInterval, string>> = {
  starter:    { month: "STRIPE_PRICE_STARTER_MONTHLY",    year: "STRIPE_PRICE_STARTER_YEARLY" },
  pro:        { month: "STRIPE_PRICE_PRO_MONTHLY",        year: "STRIPE_PRICE_PRO_YEARLY" },
  business:   { month: "STRIPE_PRICE_BUSINESS_MONTHLY",   year: "STRIPE_PRICE_BUSINESS_YEARLY" },
  site:       { month: "STRIPE_PRICE_SITE_MONTHLY",       year: "STRIPE_PRICE_SITE_YEARLY" },
  multi_site: { month: "STRIPE_PRICE_MULTI_SITE_MONTHLY", year: "STRIPE_PRICE_MULTI_SITE_YEARLY" },
};
```

`getStripePriceId("free", …)` throws
`"The Free plan has no Stripe price — it needs no checkout."`.
`listStripePriceEnvVars()` returns the ten names above (never a `free` entry).
`planFromStripePriceId()` iterates `allPlans` minus `free`.
`createCheckoutSession()` in `dashboard/settings/billing/actions.ts` additionally rejects a
plan whose `kind` ≠ the caller's company kind (`"That plan isn't available for this account."`).
The Stripe webhook needs no change beyond `planFromStripePriceId` widening.

#### 3.4.2 `/restaurants` copy rules

Allowed factual claim, with attribution, once:
> In MachineQ's 2026 survey of restaurant operators, 49% said equipment failure or
> unplanned maintenance had caused downtime. *(MachineQ 2026 restaurant equipment report,
> via restaurantnews.com)*

**Forbidden:** named customers, logos, testimonials, quotes, review counts, "trusted by",
uptime/savings numbers, any figure not in the line above. There are no customers yet.
Also forbidden anywhere in the product: language implying EquipQR monitors dispatch or
guarantees a vendor response. Sections: hero ("Tag the kitchen. Any cook can send the
right vendor a work order.") → the 7:40 pm dishwasher story → how it works in four steps →
what staff see (reuse `<PhoneMock>`) → what the owner sees → pricing teaser linking
`/pricing?for=owners` → FAQ → CTA `/signup?kind=owner`. `export const metadata`.

---

## 4. File ownership + cross-workstream interfaces

### 4.1 Ownership of every file more than one workstream might touch

| File | Owner | Rule for the others |
|---|---|---|
| `supabase/migrations/**` | **WS1** | Nobody else adds a migration. If you think you need one, report it instead |
| `scripts/local-db/smoke-owner.sql` | **WS1** | WS2/3/4 may only append a clearly delimited section at the end |
| `src/lib/types.ts` | **WS1** | Append-only afterwards; never reorder or reformat |
| `src/lib/plans.ts` | **WS1** (types, plan rows, helpers) → **WS4** (price map only) | WS2/WS3 import only |
| `src/lib/vocab.ts` | **WS1** | import only |
| `src/lib/dispatch.ts` | **WS1** | import only |
| `src/components/dispatch-status-badge.tsx` | **WS1** | import only |
| `src/lib/rate-limit.ts`, `src/lib/events.ts`, `src/lib/features.ts`, `src/lib/qr.ts`, `src/lib/email/layout.ts` | **WS1** | append-only |
| `src/lib/billing.ts` | **WS4** | WS2 imports `assertCanAddLocation`; WS2 must not edit the file |
| `src/lib/public-request.ts` | **WS3** | append-only for anyone else |
| `src/components/dashboard-nav-links.ts` + `dashboard-nav.tsx` + `dashboard-topnav.tsx` | **WS2** | WS4 must not touch |
| `src/app/dashboard/layout.tsx` | **WS2** | WS4 tells WS2 the exact locked-screen guard it needs, in its report |
| `src/app/e/[qrToken]/page.tsx` and everything under `src/app/e/**` | **WS3** | WS2 must not touch |
| `src/app/dashboard/requests/page.tsx` (list) | **WS2** | renders WS1's `<DispatchStatusBadge>` |
| `src/app/dashboard/requests/[id]/page.tsx` | **WS2** | **one import + one JSX line** for WS3's `<DispatchPanel>` and nothing else |
| `src/app/dashboard/requests/[id]/dispatch-panel.tsx`, `requests/dispatch-actions.ts` | **WS3** | |
| `src/app/dashboard/equipment/**` | **WS2** | |
| `src/app/(marketing)/**` | **WS4** | |
| `vercel.json` | **WS3** | append one cron entry |
| `.env.local.example` | **WS4** | |
| `docs/*.md` | each workstream appends its own new section; nobody rewrites another's | |
| `package.json` | **nobody** — this build adds no dependencies | |

### 4.2 Interfaces frozen before anyone writes code

Build against these even when the other side doesn't exist yet on your branch.

**Database (WS1 → everyone).** Every RPC name, argument list, error code and returned key
in §2.2. Treat §2.2 as the wire format.

**`<DispatchStatusBadge>`** — `@/components/dispatch-status-badge`, props exactly
`{ status: DispatchStatus | null; vendorName?: string | null; etaAt?: string | null; timeZone?: string | null; className?: string }`.
WS1 ships it complete; WS2 renders it in the request list; WS3 renders it in the panel.

**`<DispatchPanel>`** — `@/app/dashboard/requests/[id]/dispatch-panel`, props exactly
`{ requestId: string; companyKind: CompanyKind }`. WS3 creates it; WS2 mounts it with
`{companyKind === "equipment_owner" && <DispatchPanel requestId={request.id} companyKind={companyKind} />}`
and reports the line number it landed on.

**`vocabFor(kind)`** — `@/lib/vocab`. WS2, WS3 and WS4 all read labels from it. No
workstream hard-codes "Work order" or "Vendor" in a shared component.

**`RESTAURANT_EQUIPMENT_TEMPLATES`** — `@/lib/owner-templates`, WS2, shape
`{ name: string; description: string; symptom_chips: string[] }[]`. Content is §5.1 — copy
it, don't invent it.

**Email helpers** — names and signatures in §3.3.9 (WS3). Nobody else sends dispatch email.

**Rate-limit bucket keys** — `osr:ip:`, `osr:tok:`, `osr:rpc:`, `pin:loc:`, `pin:tok:`,
`va:ip:`, `va:tok:`, `vd:`, `vi:tok:`, `vp:ip:`. Never reuse another workstream's prefix.

**Storage prefixes** — customer/staff report photos keep
`service-request-media/<qrToken>/…`; vendor invoices are
`equipment-files/<company_id>/dispatch-invoices/<dispatch_id>/<uuid>.<ext>` and nothing else.

---

## 5. Seed data

### 5.1 `RESTAURANT_EQUIPMENT_TEMPLATES` (WS2, `src/lib/owner-templates.ts`)

Seeded per owner company at first-run into `equipment_types` (`name`, `description`,
`symptom_chips`). **Idempotent**: skip any type whose `lower(name)` already exists for that
company. Each chip ≤ 40 characters.

| `name` | `description` | `symptom_chips` |
|---|---|---|
| Dish machine | Commercial dishwasher / warewasher. | `Not draining`, `Not filling`, `Not heating`, `Dishes come out dirty`, `Leaking`, `Error code on display`, `Won't start`, `Out of detergent` |
| Reach-in cooler | Under-counter or upright refrigerator / freezer. | `Not cooling`, `Freezing product`, `Ice build-up`, `Door won't seal`, `Running constantly`, `Water on the floor`, `Loud noise`, `Error code on display` |
| Walk-in cooler | Walk-in refrigeration box and its condensing unit. | `Not cooling`, `Freezing product`, `Ice on the evaporator`, `Water on the floor`, `Door won't seal`, `Fan not running`, `Alarm sounding`, `Light out` |
| Ice machine | Cuber, flaker or nugget machine and its bin. | `Not making ice`, `Ice tastes or smells bad`, `Small or hollow cubes`, `Water leaking`, `Bin not filling`, `Won't start`, `Loud noise` |
| Espresso machine | Espresso brewer and steam boiler. | `No water or pressure`, `Steam wand not working`, `Group head leaking`, `Water not hot enough`, `Error code on display`, `Won't power on`, `Grinder not dosing` |
| Coffee brewer | Batch brewer and hot water tower. | `Not brewing`, `Brewing very slowly`, `Water not hot`, `Leaking`, `Won't power on`, `Descale or service light on` |
| Fryer | Gas or electric deep fryer and filtration. | `Not heating`, `Overheating`, `Oil leaking`, `Won't ignite / pilot out`, `Temperature is off`, `Filter not working`, `Error code on display` |
| Range / oven | Range top, convection or deck oven. | `Burner won't light`, `Oven not heating`, `Uneven heat`, `Door won't close`, `Temperature is off`, `Gas smell — call for help now`, `Error code on display` |
| Hood / fire suppression | Exhaust hood, make-up air and the suppression system. | `Fan not running`, `Smoke in the kitchen`, `Filters need service`, `Light out`, `Suppression system discharged`, `Inspection tag expired` |
| Mixer | Planetary or spiral dough mixer. | `Won't start`, `Grinding noise`, `Bowl won't lift`, `Attachment won't lock`, `Leaking oil`, `Speed won't change` |
| POS terminal | Point-of-sale terminal, printer and card reader. | `Won't power on`, `Offline / no network`, `Card reader not reading`, `Printer not printing`, `Screen frozen`, `Cash drawer won't open` |
| HVAC | Building heating and air conditioning. | `Not cooling`, `Not heating`, `No airflow`, `Thermostat unresponsive`, `Water leaking`, `Loud noise`, `Filter needs changing` |

The "Something else" chip is **not** in the data — WS3's form appends it in the UI so it
can't be edited away.

### 5.2 Vendor / category defaults

No vendor seed data. The owner adds their own; `/dashboard/vendors` ships with an
`<EmptyState>`: "Add the companies who service your equipment. You'll pick one per unit —
or set a default for a whole category, like refrigeration."

### 5.3 Troubleshooting guides — deliberately skipped

Stock "try this first" guides are **not** seeded. `guide_steps` + `guide_options` is a
directed graph with a single-root unique index (0005) and per-option outcomes; authoring
twelve of them is a content project, not a build task, and every row would have to be
duplicated per company because `equipment_types` is tenant-scoped. Owners who want one
already have the AI drafter at `/dashboard/equipment-types/[id]`. Symptom chips carry
Phase 1. Say this in `docs/MARKETING.md` so the copy doesn't promise guides.

---

## 6. Test plan

### 6.1 `scripts/local-db/smoke-owner.sql` (WS1)

Same shape as `smoke-next.sql`: `\set ON_ERROR_STOP on`, fixed UUID seed data,
`set role anon` / `set role authenticated; set request.jwt.claim.sub = …` /
`set role service_role; set request.jwt.claim.role = 'service_role'`, `do $$ … raise
exception … $$` assertions, final `select 'smoke-owner OK' as result;`.
Run against a **fresh** `db.sh reset` (it seeds fixed ids; don't share a database with
another smoke file).

Seed: provider company **P** (kind default) with its own equipment + code; owner company
**O** (`kind='equipment_owner'`) with location **L** (`site_pin='4821'`), vendor **V**
(email + phone, `ack_sla_minutes=120`), equipment type with `symptom_chips`, equipment **E**
(`location_id=L`, `vendor_id=V`), qr code. Profiles: O-owner, O-technician, P-owner.

It must prove, at minimum:

**As anon**
1. `resolve_qr_code(O)` → `guide.company.kind='equipment_owner'`, `guide.site_pin_required=true`,
   `guide.equipment_type.symptom_chips` length > 0, `guide.location.name` present.
2. The whole `resolve_qr_code(O)` JSON contains **no** `site_pin` key and **no** `vendor` key
   (assert on the rendered text: `v::text not like '%site_pin%'`, `not like '%4821%'`).
3. `resolve_qr_code(P)` is unchanged: `company.kind='service_provider'`,
   `site_pin_required=false`, `open_requests` still present, every 0023 key still present.
4. `submit_owner_service_request` with no pass → `P0004`.
5. `verify_site_pin(O,'0000')` → `ok=false`, `pass` null.
6. `verify_site_pin(O,'4821')` → `ok=true`, `pass` is 48 chars and `<> '4821'`.
7. Submit with that pass → succeeds; `vendor.name`/`vendor.phone` present;
   `company_notification_email`, `vendor_email`, `dispatch_id`, `dispatch_token` **all null**.
8. `submit_owner_service_request` against **P**'s token → `P0003`.
9. `priority` `'urgent'` is coerced to `'normal'` (assert the stored row).
10. Direct table reads return nothing: `select count(*) from vendors` / `locations` /
    `dispatches` / `site_pin_passes` / `category_default_vendors` all `= 0`.
11. 16 consecutive wrong PINs → the last one raises `54000`.

**As service role**
12. Submit → `company_notification_email`, `vendor_email`, `dispatch_id`, `dispatch_token` all non-null.
13. One `dispatches` row, `status='sent'`, `sent_at is null`; `service_requests.dispatch_status='sent'`
    and `dispatch_id` set (trigger).
14. `mark_dispatch_sent(id,true)` → `sent_at` stamped; calling it twice changes nothing.
15. `claim_dispatch_sla_alerts(stamp)` with `sent_at` back-dated 4 hours → 1 row,
    `sla_alerted_at = stamp`; calling it again → 0 rows.
16. `vendor_attach_dispatch_invoice` with a path **not** under
    `<company_id>/dispatch-invoices/<dispatch_id>/` → `22023`; with the right path → ok.

**As anon, vendor token**
17. `get_vendor_dispatch(token)` → stamps `viewed_at`, `status='viewed'`, propagates to
    `service_requests.dispatch_status`; the payload contains no `site_pin`, no `cost_cents`,
    no internal activity row, and `media` entries have no `storage_path`.
18. `get_vendor_dispatch('deadbeef…')` → `P0002`.
19. **Token isolation**: create a second request + dispatch D2 on a second unit; every vendor
    RPC called with D1's token leaves D2 completely unchanged (assert D2's `status`,
    `acknowledged_at`, `eta_at`, `vendor_notes` after the calls).
20. `vendor_acknowledge_dispatch` → `status='acknowledged'`; the parent request moves
    `new` → `in_progress`; exactly one new `request_activity` row with
    `kind='dispatch'`, `author_kind='vendor'`, `visibility='customer'`.
21. `vendor_set_dispatch_eta` with a past timestamp → `22023`; with a valid one → `eta_given`.
22. `vendor_finish_dispatch` → `dispatches.status='finished'` and
    `service_requests.status` is **still not** `'resolved'` or `'canceled'`.
23. `vendor_decline_dispatch` after `finished` → `P0001`.
24. Any vendor RPC after the request is set to `resolved` → `P0001`.
25. `vendor_attach_dispatch_invoice` as anon → `insufficient_privilege`.
26. `claim_dispatch_sla_alerts` / `mark_dispatch_sent` as anon and as authenticated →
    `insufficient_privilege`.

**Cross-tenant (this is the part the security review reads first)**
27. As P's owner: `select count(*)` over O's `vendors`, `locations`, `dispatches`,
    `category_default_vendors`, `site_pin_passes`, `staff_badges` → all `0`.
28. As P's owner: insert into `vendors`/`locations` with `company_id = O` → fails.
29. As P's owner: `update locations set site_pin='0000' where company_id = O` → 0 rows.
30. As O's technician: own `vendors`/`locations` visible and insertable; `delete from vendors`
    → 0 rows (owner-only delete policy).
31. As O's owner: `insert into dispatches (…)` directly → fails (no insert policy).
32. As O's owner: `insert into equipment_access (…)` → fails; `select count(*) from equipment_access` → `0`.

**Plans and limits**
33. Owner company with an expired trial and no subscription: `get_company_entitlements()`
    → `plan_id='free'`, `is_locked=false`, `company_kind='equipment_owner'`,
    `max_locations=1`.
34. Inserting an 11th unit for that company → `EQUIPMENT_LIMIT_REACHED`.
35. Inserting a 2nd location for that company → `LOCATION_LIMIT_REACHED`.
36. Provider company with an expired trial: `is_locked=true`, `plan_id='starter'` (unchanged).

**Sign-up**
37. `create_company_and_profile(a,b,c)` (3 args) still returns a company with
    `kind='service_provider'`.
38. `create_company_and_profile(a,b,c,'equipment_owner')` returns one with that kind.
39. `create_company_and_profile(a,b,c,'nonsense')` → `22023`.

Also append a two-line regression to the end of `smoke-owner.sql` re-running
`resolve_qr_code` and `submit_service_request` against **P** to prove the provider path is
byte-compatible. `smoke-next.sql`, `smoke.sql` and `smoke-port.sql` must still pass
unmodified, each after its own reset.

### 6.2 Vitest

| File | Workstream | Cases |
|---|---|---|
| `src/lib/vocab.test.ts` | WS1 | both kinds populated; `vocabFor(null)` → provider; no empty string in any field |
| `src/lib/dispatch.test.ts` | WS1 | `DISPATCH_STATUS_LABELS` covers every enum value; `isVendorActionable` false for `finished`/`declined`; `dispatchSummary` renders an ETA in the given zone and omits it when null |
| `src/lib/plans.test.ts` | WS4 | `plans` still has exactly the 3 provider ids; `plansFor` splits correctly; `getPlan` resolves all 6; `canAddLocation` at/over the limit; `getStripePriceId('free','month')` throws; `listStripePriceEnvVars()` has 10 unique names; `planFromStripePriceId` round-trips with env set |
| `src/lib/public-request.test.ts` (append) | WS3 | `ownerServiceRequestSchema`: rejects empty description **and** empty symptoms together, accepts either alone; caps symptoms at 12 and each at 120 chars; enforces the `<qrToken>/` media prefix; honeypot; `vendorActionSchema` discriminated union rejects an unknown action and a missing ETA |
| `src/lib/owner-templates.test.ts` | WS2 | 12 entries; names unique case-insensitively; every entry ≥ 6 chips; no chip > 40 chars; no chip repeated within a type |
| `src/lib/email/vendor-dispatch.test.ts` | WS3 | subject contains the owner and equipment names, is ≤ 160 chars and contains no `\r`/`\n` even when the equipment name does; `<script>` in a description is escaped in `html`; the text part contains the `/v/<token>` URL |
| `src/lib/email/owner-notifications.test.ts` | WS3 | no-vendor subject differs from the dispatched one; SLA email puts the vendor phone in the first body line |
| `src/components/dashboard-nav-links.test.ts` (append) | WS2 | `navLinksFor("equipment_owner")` contains Locations + Vendors + "Work Orders" and contains **no** Customers/Schedule/Checklists; `navLinksFor("service_provider")` deep-equals `dashboardNavLinks` |

### 6.3 Playwright

**Add none.** `e2e/public.spec.ts` runs against the CI dummy Supabase project, so no owner
flow (which needs a company, a location, a vendor and a code) can be exercised there. WS4
may add a single static-render assertion for `/restaurants` to the existing spec if it is
a two-line change; nothing else. Anything more is a report item, not a commit.

---

## 7. Security checklist for this build

Every item must be ticked in the workstream's final report.

1. **Token entropy.** `dispatches.token` and `staff_badges.token` are
   `encode(gen_random_bytes(24),'hex')` — 192 bits, 48 chars. Never shorten, never derive a
   token from an id, a timestamp or a company slug. `site_pin_passes.token` likewise.
2. **Dispatch token never reaches the reporter.** `dispatch_token` and `dispatch_id` in
   `submit_owner_service_request`'s result are `is_service_role()`-gated. `/api/owner-requests`
   must not echo them into its JSON response. A smoke assertion covers this; keep it.
3. **PIN handling.** `locations.site_pin` is never selected by any anon-callable RPC, never
   logged, never put in a URL, never written to `localStorage`, never returned in an error
   message, and never compared client-side. The browser stores only the opaque pass. The
   gate's failure copy is "That code didn't match" — no length or format hint.
4. **PIN brute force.** Two `check_rate_limit` buckets inside `verify_site_pin`
   (`pin:loc:` 30/h, `pin:tok:` 15/h), checked **before** the comparison, plus
   `sitePinPerIp` at the route. Accepted trade-off: a determined attacker can lock a
   location's PIN prompt for an hour. That is a nuisance, not a breach — the staff poster
   still carries the vendor's phone number, and the owner can clear the PIN.
5. **Vendor page scope.** `get_vendor_dispatch` returns exactly the keys in §2.2.4 and
   nothing else: one request, one unit, one location, one vendor. Never join to other
   requests, other units, `profiles`, `cost_cents`, internal activity, or `vendors.email`.
   Cross-token isolation is smoke-tested (assertion 19).
6. **Storage path scoping for invoices.** The upload path is built **server-side** from
   `company_id` + `dispatch_id` + a fresh `crypto.randomUUID()` and an extension derived
   from the validated content type. The filename the vendor sends is discarded. The RPC
   re-validates the prefix with a `like '<company_id>/dispatch-invoices/<dispatch_id>/%'`
   check, so a compromised route still cannot write a row pointing at another tenant's
   object. Size cap 10 MB, types `application/pdf`, `image/jpeg`, `image/png` only.
7. **Photo access for vendors** goes through `/v/<token>/media/<index>` with a bounds-checked
   integer index and a 5-minute signed URL. No storage path is ever sent to the vendor's
   browser, so the bucket cannot be enumerated from that page.
8. **Email header injection.** `sanitizeEmailSubject()` strips `\r`, `\n`, `\t` and other
   C0 controls and truncates to 140 chars; every subject goes through it. `Reply-To` is set
   **only** from `companies.notification_email` after `sanitizeEmailHeader()` (returns null
   if it contains `,`, `;`, whitespace or a control char — then the email goes without a
   reply-to rather than with a forged one). `vendors.email` is CHECK-constrained against the
   same characters at the database level. Every user-supplied value in an HTML body goes
   through `escapeHtml()`.
9. **Anon write paths.** All of them are SECURITY DEFINER RPCs with `set search_path = public`
   that resolve the tenant from the token. No route ever accepts a `company_id`,
   `vendor_id`, `location_id` or `dispatch_id` from the client. `check_rate_limit` stays
   service-role only and is called from inside the definer functions, never granted to anon.
10. **Cron idempotency.** `dispatch-sla` is `CRON_SECRET`-bearer-gated and claims rows by
    stamping `sla_alerted_at = p_claim_stamp` inside a single `UPDATE … FOR UPDATE SKIP LOCKED`,
    so two overlapping runs cannot both alert. A failed send releases only its own stamp.
    One alert per dispatch, ever, unless a human clears the column. Smoke assertion 15.
11. **No RLS regression.** This build adds policies to seven new tables and changes none of
    the existing ones. If you believe an existing policy needs to change, stop and report it.
    `equipment_access` must be empty and referenced by nothing after the smoke run.
12. **Liability copy is a security control.** The "EquipQR sends the request; it can't
    confirm anyone picked it up" sentence on the confirmation screen and in the SLA email is
    required. No copy anywhere may imply monitored dispatch, guaranteed response, or an
    SLA EquipQR owns.
13. **Manager/staff roles grant nothing new.** Adding two enum values must not widen any
    policy. `is_company_owner()` is untouched; `'staff'` is never assigned to a profile in
    Phase 1.

---

## 8. Verification

Run from the repo root. Every workstream runs all of these before reporting.

```bash
npm install                       # node_modules is not checked in; do this first,
                                  # then read node_modules/next/dist/docs/ before writing routes

npm run lint
npx tsc --noEmit
npm test

NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy-anon-key-for-ci-builds-only \
NEXT_PUBLIC_APP_URL=http://localhost:3000 \
  npm run build

# Database — each smoke file needs its own fresh reset (they seed fixed UUIDs).
scripts/local-db/db.sh start
scripts/local-db/db.sh reset && psql "$(scripts/local-db/db.sh url)" -f scripts/local-db/smoke-owner.sql
scripts/local-db/db.sh reset && psql "$(scripts/local-db/db.sh url)" -f scripts/local-db/smoke-next.sql
scripts/local-db/db.sh reset && psql "$(scripts/local-db/db.sh url)" -f scripts/local-db/smoke.sql
scripts/local-db/db.sh reset && psql "$(scripts/local-db/db.sh url)" -f scripts/local-db/smoke-port.sql
```

There is no Supabase project and no `.env.local` in this environment — the dummy-env build
above is the only end-to-end check available, and `db.sh` is the only way to validate SQL.
Playwright (`npm run test:e2e`) needs `npm run build` first; run it only if you touched
`src/app/(marketing)/**`.

### Definition of done (all four workstreams)

1. Lint, `tsc --noEmit`, `npm test` and the dummy-env build all pass; `smoke-owner.sql`
   and the three pre-existing smoke files all pass after their own reset.
2. Every mutation appends the right `equipment_events` / `request_activity` row through
   `src/lib/events.ts`.
3. Every new table access respects RLS (staff client) or goes through a SECURITY DEFINER
   RPC (public). The admin client appears **only** inside `src/app/api/**` route handlers
   and the Stripe webhook — never in a page, a layout or a server action.
4. Everything under `/e/*`, `/r/*` and `/v/*` works one-handed on a 375 px screen with no
   login and no JavaScript beyond what the form needs.
5. The §7 checklist is answered item by item in your report.
6. Report: files touched, every shared-file line you appended, every interface you consumed
   before it existed, the exact line where you mounted another workstream's component, and
   anything you deferred.

---

## 9. Open questions (with the default that ships unless Carson says otherwise)

| # | Question | Default shipped |
|---|---|---|
| 1 | Should an owner-kind company ever be *locked* (trial over, no subscription)? | **No.** Owners fall back to the `free` plan (1 location / 10 units) and keep working; `is_locked` is always false for `equipment_owner`. Providers are unchanged. |
| 2 | What can a `manager` actually do in Phase 1? | **Exactly what a technician can.** The role is grantable via the existing invite flow and shows a different label; no RLS or entitlement change. Approve/close-only powers are Phase 2. |
| 3 | Site PIN length, and is a per-location lockout acceptable? | **4 digits default, 4–8 allowed.** Two per-location/per-sticker rate-limit buckets are the real control; a malicious lockout for an hour is an accepted nuisance (the vendor's phone is on the poster). |
| 4 | May the `/v/<token>` page show the owner's `notification_email` and `companies.phone`? | **Yes, token-scoped only.** The vendor already has that address as the dispatch `Reply-To`, and needs a way to reach the owner from the page. |
| 5 | `equipment.location_id` vs the existing free-text `equipment.location` | **Keep both.** `location_id` is the site; `location` stays "where in the building" (walk-in corridor, bar back). The equipment form labels them that way. |
| 6 | Are symptom chips per-company or a shared catalogue? | **Per-company**, on `equipment_types.symptom_chips`, seeded per owner at first run. A global catalogue would need a new tenant-free table and a public read path. |
| 7 | Owner yearly prices | **10× monthly** ($240 / $690), matching the provider pattern (29 → 290). Change before the Stripe products are created, not after. |
| 8 | Owner sign-up entry parameter | **`/signup?kind=owner`** (and `?kind=provider`). `/restaurants` links with it. |
| 9 | Reporter phone stored twice (`contact_phone` + `reporter_phone`) | **Yes**, deliberately: `contact_phone` keeps every existing notification path working, `reporter_phone` is the stable "who reported it" value for the owner UI and the vendor page. |
| 10 | What happens when a unit has no vendor at all? | **No dispatch row is created**; the request is still filed, the owner gets `buildOwnerNoVendorEmail`, and the confirmation screen says the manager was notified instead. There is no "notify me" vendor placeholder record. |
