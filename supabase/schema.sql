-- ============================================================================
-- Lucy CRM — full schema (single-table-per-concept edition)
--
-- One-shot setup script. Paste into the Supabase SQL editor and Run once, or
-- apply with `supabase db execute -f supabase/schema.sql`.
--
-- Tables: customers, tags (activity log), products, purchases, forms,
-- form_submissions. No profiles/auth. Idempotent (safe to re-run).
--
-- The `tags` table is ONE activity log — see its section for the model.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- admins — the CRM operators who can log in (NOT contacts/customers)
-- ---------------------------------------------------------------------------
-- Lightweight auth: email + scrypt password hash, HMAC-signed session cookie
-- (no Supabase Auth / auth.users dependency). password_hash never leaves the
-- server. Seed one row to be able to log in — the app also seeds a demo admin
-- in in-memory mode (admin@lucy.crm / admin1234).
create table if not exists admins (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  name          text not null,
  password_hash text not null,
  role          text not null default 'admin' check (role in ('owner','admin')),
  last_login_at timestamptz,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_admins_email on admins (lower(email));
drop trigger if exists trg_admins_updated on admins;
create trigger trg_admins_updated before update on admins
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- customers (contacts) — the one place a person lives
-- ---------------------------------------------------------------------------
create table if not exists customers (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text,
  notes         text,
  custom_fields jsonb not null default '{}'::jsonb,
  utm           jsonb not null default '{}'::jsonb,  -- first-touch attribution
  hidden        boolean not null default false,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_customers_email on customers (lower(email));
create index if not exists idx_customers_name on customers (lower(name));
drop trigger if exists trg_customers_updated on customers;
create trigger trg_customers_updated before update on customers
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- tags — ONE table, an activity log (tags + customer_tags + tag_events merged)
-- ---------------------------------------------------------------------------
-- Every row is an activity entry:
--   kind = 'created' — a tag was defined            (who_* empty)
--   kind = 'added'   — tag applied to contact(s)    (who_ids/who_names set)
--   kind = 'removed' — tag taken off contact(s)     (who_ids/who_names set)
--
-- `tag_id` threads all rows of one tag together (the 'created' row's tag_id is
-- its own identity). A tag's CURRENT membership is derived: per contact, the
-- most recent 'added'/'removed' row mentioning them wins. Name/colour live on
-- the 'created' row (edited in place by renames). Deleting a tag = set
-- archived_at on its 'created' row.
create table if not exists tags (
  id          uuid primary key default gen_random_uuid(),
  tag_id      uuid not null,
  kind        text not null check (kind in ('created','added','removed')),
  name        text not null,           -- snapshot
  color       text not null default '#6366f1',  -- snapshot
  who_ids     uuid[] not null default '{}',     -- affected contacts (empty for 'created')
  who_names   text[] not null default '{}',     -- snapshot, parallel to who_ids
  archived_at timestamptz,             -- set on the 'created' row when deleted
  created_at  timestamptz not null default now()
);
create index if not exists idx_tags_tag_id on tags (tag_id);
create index if not exists idx_tags_kind on tags (kind);
create index if not exists idx_tags_created on tags (created_at desc);
-- Fast "current membership" lookups by contained contact id.
create index if not exists idx_tags_who_ids on tags using gin (who_ids);

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
create table if not exists products (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  description       text,
  price             numeric(12,2) not null default 0,
  currency          text not null default 'USD',
  billing_type      text not null default 'one_time' check (billing_type in ('one_time','subscription')),
  hidden            boolean not null default false,
  source_project_id uuid,
  archived_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
drop trigger if exists trg_products_updated on products;
create trigger trg_products_updated before update on products
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- purchases (the "product history" ledger)
-- ---------------------------------------------------------------------------
create sequence if not exists purchase_ref_seq;
create table if not exists purchases (
  id            uuid primary key default gen_random_uuid(),
  purchase_ref  text not null unique default ('P-' || lpad(nextval('purchase_ref_seq')::text, 6, '0')),
  customer_id   uuid not null references customers(id) on delete cascade,
  customer_name text not null default '',   -- snapshot
  product_id    uuid references products(id) on delete set null,
  product_name  text not null default '',   -- snapshot
  unit_amount   numeric(12,2) not null default 0,
  currency      text not null default 'USD',
  status        text not null default 'paid' check (status in ('unpaid','paid','refunded')),
  purchased_at  date not null default current_date,
  billing_type  text not null default 'one_time' check (billing_type in ('one_time','subscription')),
  period_start  date,
  period_end    date,
  sub_status    text not null default 'none' check (sub_status in ('active','trialing','past_due','canceled','none')),
  canceled_at   timestamptz,
  external_ref  text,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_purchases_customer on purchases (customer_id);
create index if not exists idx_purchases_product on purchases (product_id);
create index if not exists idx_purchases_purchased_at on purchases (purchased_at);
drop trigger if exists trg_purchases_updated on purchases;
create trigger trg_purchases_updated before update on purchases
  for each row execute function set_updated_at();

-- Fill in denormalized snapshots from the linked rows on insert if the caller
-- didn't supply them. Keeps history readable after a product/customer is
-- renamed or deleted.
create or replace function fill_purchase_snapshots()
returns trigger language plpgsql as $$
begin
  if (new.customer_name is null or new.customer_name = '') and new.customer_id is not null then
    select name into new.customer_name from customers where id = new.customer_id;
  end if;
  if new.product_id is not null then
    if new.product_name is null or new.product_name = '' then
      select name into new.product_name from products where id = new.product_id;
    end if;
    if new.unit_amount = 0 then
      select price into new.unit_amount from products where id = new.product_id;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_purchases_snapshot on purchases;
create trigger trg_purchases_snapshot before insert on purchases
  for each row execute function fill_purchase_snapshots();

-- ---------------------------------------------------------------------------
-- forms + submissions
-- ---------------------------------------------------------------------------
create table if not exists forms (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  slug            text not null unique,
  token           text not null unique default encode(gen_random_bytes(16), 'hex'),
  fields          jsonb not null default '[]'::jsonb,
  mapping         jsonb not null default '{"fields":{},"apply_tag_ids":[]}'::jsonb,
  create_customer boolean not null default true,
  active          boolean not null default true,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
drop trigger if exists trg_forms_updated on forms;
create trigger trg_forms_updated before update on forms
  for each row execute function set_updated_at();

create table if not exists form_submissions (
  id          uuid primary key default gen_random_uuid(),
  form_id     uuid not null references forms(id) on delete cascade,
  payload     jsonb not null default '{}'::jsonb,
  mapped      jsonb not null default '{}'::jsonb,
  customer_id uuid references customers(id) on delete set null,
  source_ip   text,
  utm         jsonb not null default '{}'::jsonb,  -- captured utm_* params
  status      text not null default 'received',
  created_at  timestamptz not null default now()
);
create index if not exists idx_submissions_form on form_submissions (form_id);
-- Bring older databases up to date if the column pre-dates this change.
alter table form_submissions add column if not exists utm jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- There is no auth/staff model. The app connects with the service-role key,
-- which bypasses RLS entirely, so these policies only matter if you ever expose
-- the anon key directly. Public form rendering needs anon read on active forms;
-- everything else is closed to anon by default (no policy = no anon access).
alter table admins            enable row level security;
alter table customers         enable row level security;
alter table tags              enable row level security;
alter table products          enable row level security;
alter table purchases         enable row level security;
alter table forms             enable row level security;
alter table form_submissions  enable row level security;
-- admins has NO policy on purpose: anon can never read password hashes; only
-- the service-role key (used by the app server) can touch it.

-- Public forms are readable by anyone (needed to render the embedded form).
drop policy if exists forms_public_read on forms;
create policy forms_public_read on forms for select using (active and archived_at is null);

-- ---------------------------------------------------------------------------
-- Clean up objects from the previous multi-table design, if present.
-- (Safe no-ops on a fresh database.)
-- ---------------------------------------------------------------------------
drop table if exists tag_events cascade;
drop table if exists customer_tags cascade;
drop table if exists profiles cascade;
drop function if exists is_staff() cascade;
drop function if exists handle_new_user() cascade;
