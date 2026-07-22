-- ============================================================================
-- Lucy CRM — DATABASE REDESIGN v2 (proposed)
--
-- A clean, relational, production-quality schema for a SINGLE-TENANT CRM on
-- PostgreSQL (Supabase). Redesigns ONLY the database layer; the application
-- architecture (repository pattern, server actions, soft deletes, UUID PKs,
-- snapshot fields, JSON for definitions, relational runtime) is preserved.
--
-- Prefers clean relational modeling over minimizing table count. Comfortably
-- supports tens of thousands of contacts while staying easy for a solo dev to
-- understand. See DB_REDESIGN.md for the ER diagram, rationale, and migration.
--
-- Idempotent where practical. Intended as the target for a fresh database or
-- the end-state of the expand/backfill/contract migration in DB_REDESIGN.md.
-- ============================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "btree_gist";  -- exclusion constraint on bookings
create extension if not exists "citext";      -- case-insensitive email/text
create extension if not exists "pg_trgm";      -- trigram search on name/company

-- ---------------------------------------------------------------------------
-- Shared trigger: stamp updated_at on every UPDATE.
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Reusable macro-ish helper is not possible in DDL; each table below attaches
-- the trigger explicitly with: create trigger trg_<t>_updated ...

-- ============================================================================
-- 1. ADMINS — the operators who log in (NOT contacts)
-- ============================================================================
create table if not exists admins (
  id            uuid primary key default gen_random_uuid(),
  email         citext not null unique,
  name          text not null,
  password_hash text not null,
  role          text not null default 'admin' check (role in ('owner','admin')),
  last_login_at timestamptz,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_admins_active on admins (id) where archived_at is null;
drop trigger if exists trg_admins_updated on admins;
create trigger trg_admins_updated before update on admins
  for each row execute function set_updated_at();

-- ============================================================================
-- 2. CUSTOMERS — the one place a person/lead lives (expanded)
-- ============================================================================
-- lead_source is a soft FK (text) to keep the enum open; status is a lifecycle
-- stage. owner_id / created_by reference admins. Duplicate handling via
-- merged_into (this row was merged INTO another) + duplicate_of (flagged as a
-- likely dup of another). custom_fields stays JSONB (genuinely dynamic per-biz).
create table if not exists customers (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  email             citext,
  phone             text,
  company           text,
  status            text not null default 'lead'
                      check (status in ('lead','active','customer','churned','archived')),
  lead_source       text,                     -- e.g. 'form','import','manual','referral'
  owner_id          uuid references admins(id) on delete set null,
  created_by        uuid references admins(id) on delete set null,
  notes             text,                      -- freeform headline note; long notes → notes table
  custom_fields     jsonb not null default '{}'::jsonb,
  -- First-touch is immutable attribution; latest-touch updates each visit.
  utm_first_touch   jsonb not null default '{}'::jsonb,
  utm_latest_touch  jsonb not null default '{}'::jsonb,
  last_contacted_at timestamptz,
  -- Duplicate management.
  merged_into       uuid references customers(id) on delete set null,
  duplicate_of      uuid references customers(id) on delete set null,
  hidden            boolean not null default false,
  archived_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- A row cannot be its own merge target / duplicate.
  constraint chk_customers_not_self_merge check (merged_into is null or merged_into <> id),
  constraint chk_customers_not_self_dup   check (duplicate_of is null or duplicate_of <> id)
);
-- Case-insensitive unique email among LIVE, non-merged contacts only (partial
-- unique index — the app upserts by email and merges dups, so hard-uniqueness
-- on all rows would be wrong).
create unique index if not exists uq_customers_email_live
  on customers (email)
  where email is not null and archived_at is null and merged_into is null;
create index if not exists idx_customers_phone   on customers (phone) where phone is not null;
create index if not exists idx_customers_company on customers (lower(company)) where company is not null;
create index if not exists idx_customers_status  on customers (status) where archived_at is null;
create index if not exists idx_customers_owner    on customers (owner_id);
create index if not exists idx_customers_created  on customers (created_at desc);
create index if not exists idx_customers_last_contacted on customers (last_contacted_at desc);
-- Fuzzy search across name + company (typeahead / global search).
create index if not exists idx_customers_name_trgm    on customers using gin (name gin_trgm_ops);
create index if not exists idx_customers_company_trgm on customers using gin (company gin_trgm_ops);
drop trigger if exists trg_customers_updated on customers;
create trigger trg_customers_updated before update on customers
  for each row execute function set_updated_at();

-- ============================================================================
-- 3. TAGS — relational (catalogue + membership + history)
-- ============================================================================
-- Replaces the event-sourced single-table model. Current membership is a real
-- join table (directly queryable). History is a SEPARATE audit trail that is
-- NOT the source of truth.
create table if not exists tags (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  color       text not null default '#6366f1',
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- Unique tag name among live tags (case-insensitive).
create unique index if not exists uq_tags_name_live
  on tags (lower(name)) where archived_at is null;
drop trigger if exists trg_tags_updated on tags;
create trigger trg_tags_updated before update on tags
  for each row execute function set_updated_at();

-- Current membership. PK is the pair, so a contact can't hold a tag twice and
-- "is this tag on this contact?" is a direct indexed lookup.
create table if not exists customer_tags (
  customer_id uuid not null references customers(id) on delete cascade,
  tag_id      uuid not null references tags(id)      on delete cascade,
  assigned_by uuid references admins(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (customer_id, tag_id)
);
create index if not exists idx_customer_tags_tag on customer_tags (tag_id);

-- Separate, append-only history (audit trail). Bulk ops write many rows here
-- but each carries snapshots so history reads even after a tag/contact changes.
create table if not exists tag_history (
  id            uuid primary key default gen_random_uuid(),
  tag_id        uuid references tags(id) on delete set null,
  customer_id   uuid references customers(id) on delete set null,
  action        text not null check (action in ('added','removed')),
  tag_name      text not null default '',   -- snapshot
  customer_name text not null default '',   -- snapshot
  actor_id      uuid references admins(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_tag_history_tag       on tag_history (tag_id, created_at desc);
create index if not exists idx_tag_history_customer  on tag_history (customer_id, created_at desc);

-- ============================================================================
-- 4. PRODUCTS — plain sellables only (calendars/integrations extracted out)
-- ============================================================================
create table if not exists products (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  price        numeric(12,2) not null default 0 check (price >= 0),
  currency     char(3) not null default 'USD',
  billing_type text not null default 'one_time' check (billing_type in ('one_time','subscription')),
  hidden       boolean not null default false,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_products_active on products (id) where archived_at is null;
drop trigger if exists trg_products_updated on products;
create trigger trg_products_updated before update on products
  for each row execute function set_updated_at();

-- ============================================================================
-- 5. PURCHASES — sales ledger (snapshots kept, as required)
-- ============================================================================
create sequence if not exists purchase_ref_seq;
create table if not exists purchases (
  id            uuid primary key default gen_random_uuid(),
  purchase_ref  text not null unique
                  default ('P-' || lpad(nextval('purchase_ref_seq')::text, 6, '0')),
  customer_id   uuid not null references customers(id) on delete restrict,
  customer_name text not null default '',   -- snapshot (kept)
  product_id    uuid references products(id) on delete set null,
  product_name  text not null default '',   -- snapshot (kept)
  unit_amount   numeric(12,2) not null default 0 check (unit_amount >= 0),
  currency      char(3) not null default 'USD',
  status        text not null default 'paid' check (status in ('unpaid','paid','refunded')),
  purchased_at  date not null default current_date,
  billing_type  text not null default 'one_time' check (billing_type in ('one_time','subscription')),
  period_start  date,
  period_end    date,
  sub_status    text not null default 'none'
                  check (sub_status in ('active','trialing','past_due','canceled','none')),
  canceled_at   timestamptz,
  external_ref  text,                        -- e.g. Stripe payment intent
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint chk_purchase_period check (period_end is null or period_start is null or period_end >= period_start)
);
create index if not exists idx_purchases_customer  on purchases (customer_id);
create index if not exists idx_purchases_product   on purchases (product_id);
create index if not exists idx_purchases_status    on purchases (status);
create index if not exists idx_purchases_date      on purchases (purchased_at desc);
create index if not exists idx_purchases_external  on purchases (external_ref) where external_ref is not null;
drop trigger if exists trg_purchases_updated on purchases;
create trigger trg_purchases_updated before update on purchases
  for each row execute function set_updated_at();

-- ============================================================================
-- 6. CALENDARS + BOOKINGS — relational (out of Product JSON)
-- ============================================================================
-- Calendar CONFIG stays JSONB (weekly hours, slot length, scarcity, timezone —
-- genuine configuration). BOOKINGS become real rows (transactional records).
create table if not exists calendars (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  slug               text not null unique,
  description        text,
  price              numeric(12,2) not null default 0 check (price >= 0),
  currency           char(3) not null default 'USD',
  paid               boolean not null default false,
  slot_minutes       int not null default 30 check (slot_minutes between 5 and 480),
  utc_offset_minutes int not null default 0,
  timezone_label     text not null default 'UTC',
  lead_time_minutes  int not null default 0 check (lead_time_minutes >= 0),
  window_days        int not null default 30 check (window_days between 1 and 365),
  weekly_hours       jsonb not null default '{}'::jsonb,   -- config (JSON kept)
  busyness           jsonb not null default '{"enabled":false,"fraction":0,"epoch_days":0}'::jsonb,
  archived_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_calendars_active on calendars (id) where archived_at is null;
drop trigger if exists trg_calendars_updated on calendars;
create trigger trg_calendars_updated before update on calendars
  for each row execute function set_updated_at();

create table if not exists bookings (
  id               uuid primary key default gen_random_uuid(),
  calendar_id      uuid not null references calendars(id) on delete cascade,
  customer_id      uuid references customers(id) on delete set null,
  status           text not null default 'confirmed'
                     check (status in ('pending','confirmed','canceled')),
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  attendee_name    text not null,
  attendee_email   citext not null,
  notes            text,
  google_event_id  text,
  stripe_session_id text,
  hold_expires_at  timestamptz,
  amount           numeric(12,2),
  currency         char(3),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint chk_booking_time check (ends_at > starts_at),
  -- DB-level double-booking prevention: no two non-canceled bookings on the
  -- same calendar may overlap in time. Replaces app-level check + book_slot RPC
  -- for confirmed conflicts (pending holds are also enforced here).
  constraint excl_bookings_no_overlap
    exclude using gist (
      calendar_id with =,
      tstzrange(starts_at, ends_at) with &&
    ) where (status <> 'canceled')
);
create index if not exists idx_bookings_calendar_time on bookings (calendar_id, starts_at);
create index if not exists idx_bookings_customer      on bookings (customer_id);
create index if not exists idx_bookings_status        on bookings (status);
create index if not exists idx_bookings_stripe        on bookings (stripe_session_id) where stripe_session_id is not null;
-- Expire stale holds efficiently.
create index if not exists idx_bookings_pending_holds on bookings (hold_expires_at)
  where status = 'pending';
drop trigger if exists trg_bookings_updated on bookings;
create trigger trg_bookings_updated before update on bookings
  for each row execute function set_updated_at();

-- ============================================================================
-- 7. INTEGRATION SETTINGS — one row per provider (out of Product JSON)
-- ============================================================================
-- Static keys stay in env; runtime-issued secrets (e.g. Google refresh token)
-- live here in `config` JSONB (config, not transactional). One row per provider.
create table if not exists integration_settings (
  provider     text primary key check (provider in ('google','stripe','leadconnector')),
  connected    boolean not null default false,
  config       jsonb not null default '{}'::jsonb,   -- provider-specific runtime state
  connected_at timestamptz,
  updated_at   timestamptz not null default now()
);
drop trigger if exists trg_integration_updated on integration_settings;
create trigger trg_integration_updated before update on integration_settings
  for each row execute function set_updated_at();
insert into integration_settings (provider) values ('google'),('stripe'),('leadconnector')
  on conflict (provider) do nothing;

-- ============================================================================
-- 8. FORMS + SUBMISSIONS — definitions stay JSON (config), submissions relational
-- ============================================================================
create table if not exists forms (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  slug            text not null unique,
  token           text not null unique default encode(gen_random_bytes(16), 'hex'),
  fields          jsonb not null default '[]'::jsonb,   -- schema (JSON kept)
  mapping         jsonb not null default '{"fields":{},"apply_tag_ids":[]}'::jsonb,
  create_customer boolean not null default true,
  active          boolean not null default true,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_forms_active on forms (id) where active and archived_at is null;
drop trigger if exists trg_forms_updated on forms;
create trigger trg_forms_updated before update on forms
  for each row execute function set_updated_at();

create table if not exists form_submissions (
  id          uuid primary key default gen_random_uuid(),
  form_id     uuid not null references forms(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  payload     jsonb not null default '{}'::jsonb,   -- raw submitted values
  mapped      jsonb not null default '{}'::jsonb,   -- mapped values
  utm         jsonb not null default '{}'::jsonb,
  source_ip   text,
  status      text not null default 'received',
  created_at  timestamptz not null default now()
);
create index if not exists idx_submissions_form     on form_submissions (form_id, created_at desc);
create index if not exists idx_submissions_customer on form_submissions (customer_id);

-- ============================================================================
-- 9. DEALS / PIPELINE — sales pipeline (new)
-- ============================================================================
-- pipeline_stages is a small lookup so stages are configurable + ordered;
-- deals reference a stage. (A pure text stage would work but loses ordering /
-- rename-safety — a lookup is the clean relational choice.)
create table if not exists pipeline_stages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  position   int not null default 0,
  is_won     boolean not null default false,
  is_lost    boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_pipeline_stage_name on pipeline_stages (lower(name));

create table if not exists deals (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         uuid not null references customers(id) on delete cascade,
  title               text not null default '',
  stage_id            uuid references pipeline_stages(id) on delete set null,
  value               numeric(12,2) not null default 0 check (value >= 0),
  currency            char(3) not null default 'USD',
  probability         int not null default 0 check (probability between 0 and 100),
  expected_close_date date,
  owner_id            uuid references admins(id) on delete set null,
  status              text not null default 'open' check (status in ('open','won','lost')),
  closed_at           timestamptz,
  archived_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_deals_customer on deals (customer_id);
create index if not exists idx_deals_stage    on deals (stage_id);
create index if not exists idx_deals_owner    on deals (owner_id);
create index if not exists idx_deals_status   on deals (status) where archived_at is null;
create index if not exists idx_deals_close    on deals (expected_close_date);
drop trigger if exists trg_deals_updated on deals;
create trigger trg_deals_updated before update on deals
  for each row execute function set_updated_at();

-- ============================================================================
-- 10. NOTES — long-form notes per contact (new)
-- ============================================================================
create table if not exists notes (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  body        text not null,
  created_by  uuid references admins(id) on delete set null,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_notes_customer on notes (customer_id, created_at desc);
drop trigger if exists trg_notes_updated on notes;
create trigger trg_notes_updated before update on notes
  for each row execute function set_updated_at();

-- ============================================================================
-- 11. EMAILS — outbound email history (new)
-- ============================================================================
create table if not exists emails (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  provider_id text,                          -- LeadConnector/provider message id
  subject     text not null default '',
  body        text,
  status      text not null default 'queued'
                check (status in ('queued','sent','delivered','opened','clicked','bounced','failed')),
  sent_at     timestamptz,
  opened_at   timestamptz,
  clicked_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists idx_emails_customer on emails (customer_id, created_at desc);
create index if not exists idx_emails_provider on emails (provider_id) where provider_id is not null;
create index if not exists idx_emails_status   on emails (status);

-- ============================================================================
-- 12. ATTACHMENTS — files linked to a contact (new)
-- ============================================================================
create table if not exists attachments (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  filename    text not null,
  mime_type   text,
  size        bigint check (size is null or size >= 0),
  url         text not null,
  uploaded_by uuid references admins(id) on delete set null,
  uploaded_at timestamptz not null default now()
);
create index if not exists idx_attachments_customer on attachments (customer_id, uploaded_at desc);

-- ============================================================================
-- 13. ACTIVITIES — the customer-facing timeline (new)
-- ============================================================================
-- One unified, chronological stream per contact. `payload` is JSONB because the
-- shape varies by type (this is display/config data, not a relationship we
-- query across). Written by the app whenever a domain event occurs.
create table if not exists activities (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  type        text not null check (type in (
                'email_sent','email_opened','email_clicked','purchase','booking',
                'form_submitted','tag_added','tag_removed','note','imported',
                'stage_changed','deal_created','deal_won','deal_lost','manual')),
  payload     jsonb not null default '{}'::jsonb,
  created_by  uuid references admins(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_activities_customer on activities (customer_id, created_at desc);
create index if not exists idx_activities_type     on activities (type, created_at desc);

-- ============================================================================
-- 14. AUDIT LOGS — SYSTEM audit (distinct from customer activities)
-- ============================================================================
-- Who changed WHAT in the system (config edits, admin actions, integration
-- changes). Deliberately separate from `activities` (which is about a contact's
-- journey). Never soft-deleted; append-only.
create table if not exists audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references admins(id) on delete set null,
  action      text not null,                 -- e.g. 'product.update','google.connect'
  entity_type text,                           -- e.g. 'product','calendar'
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  ip          text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_audit_actor  on audit_logs (actor_id, created_at desc);
create index if not exists idx_audit_entity on audit_logs (entity_type, entity_id, created_at desc);

-- ============================================================================
-- 15. AUTOMATIONS — definitions JSON, runtime relational (unchanged intent)
-- ============================================================================
create table if not exists automations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  trigger     jsonb not null default '{"kind":"manual"}'::jsonb,   -- definition (JSON kept)
  steps       jsonb not null default '[]'::jsonb,                   -- definition (JSON kept)
  active      boolean not null default true,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_automations_active on automations (id) where active and archived_at is null;
drop trigger if exists trg_automations_updated on automations;
create trigger trg_automations_updated before update on automations
  for each row execute function set_updated_at();

create table if not exists automation_enrollments (
  id             uuid primary key default gen_random_uuid(),
  automation_id  uuid not null references automations(id) on delete cascade,
  customer_id    uuid not null references customers(id) on delete cascade,
  customer_name  text not null default '',   -- snapshot
  customer_email citext,                      -- snapshot
  status         text not null default 'active'
                   check (status in ('active','completed','canceled','failed')),
  current_step   int not null default 0,
  next_run_at    timestamptz,
  context        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
-- The runner's hot path: due active enrollments ordered by next_run_at.
create index if not exists idx_enrollments_due on automation_enrollments (status, next_run_at)
  where status = 'active';
create index if not exists idx_enrollments_automation on automation_enrollments (automation_id);
create index if not exists idx_enrollments_customer   on automation_enrollments (customer_id);
create unique index if not exists uq_enrollments_active
  on automation_enrollments (automation_id, customer_id) where status = 'active';
drop trigger if exists trg_enrollments_updated on automation_enrollments;
create trigger trg_enrollments_updated before update on automation_enrollments
  for each row execute function set_updated_at();

-- Per-step execution log (was a JSON `history` array on the enrollment; now a
-- real table so step runs are queryable/reportable and the enrollment row stays
-- small). This is runtime, so it's relational — matches the "runtime relational"
-- constraint and removes a growing JSON array from the hot enrollment row.
create table if not exists automation_step_runs (
  id            uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references automation_enrollments(id) on delete cascade,
  step_index    int not null,
  step_type     text not null check (step_type in ('email','tag','wait')),
  detail        text not null default '',
  message_id    text,
  error         text,
  ran_at        timestamptz not null default now()
);
create index if not exists idx_step_runs_enrollment on automation_step_runs (enrollment_id, ran_at);

-- ============================================================================
-- 16. Row Level Security
-- ============================================================================
-- Single-tenant app connects with the service-role key (bypasses RLS). Enable
-- RLS everywhere as defense-in-depth; add the one public policy forms need.
do $$
declare t text;
begin
  foreach t in array array[
    'admins','customers','tags','customer_tags','tag_history','products',
    'purchases','calendars','bookings','integration_settings','forms',
    'form_submissions','pipeline_stages','deals','notes','emails','attachments',
    'activities','audit_logs','automations','automation_enrollments',
    'automation_step_runs'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

drop policy if exists forms_public_read on forms;
create policy forms_public_read on forms for select using (active and archived_at is null);
drop policy if exists calendars_public_read on calendars;
create policy calendars_public_read on calendars for select using (archived_at is null);

-- ============================================================================
-- END schema_v2.sql
-- ============================================================================
