-- Lucy CRM — initial schema
-- Run in the Supabase SQL editor (or `supabase db push`). Mirrors src/lib/types.ts.
--
-- Design notes:
--  * Every table has created_at/updated_at; updated_at is maintained by a trigger.
--  * Soft-delete via archived_at (null = live). We never hard-delete records that
--    have history/financial meaning.
--  * Purchases are the single source of truth for "who bought what". A trigger
--    keeps a denormalized product-name snapshot so history survives product edits.
--  * RLS: any authenticated staff member (has a row in profiles) can read/write.
--    Anonymous access is limited to the public form-ingest path via service role.

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
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  role        text not null default 'coach' check (role in ('admin','coach','viewer')),
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_profiles_updated before update on profiles
  for each row execute function set_updated_at();

-- Auto-create a profile when a new auth user signs up. First user becomes admin.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_first boolean;
begin
  select count(*) = 0 into is_first from profiles;
  insert into profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    case when is_first then 'admin' else 'coach' end
  );
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- customers (contacts)
-- ---------------------------------------------------------------------------
create table if not exists customers (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text,
  notes         text,
  custom_fields jsonb not null default '{}'::jsonb,
  owner_id      uuid references profiles(id) on delete set null,
  hidden        boolean not null default false,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_customers_email on customers (lower(email));
create index if not exists idx_customers_name on customers (lower(name));
create trigger trg_customers_updated before update on customers
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- tags + join table
-- ---------------------------------------------------------------------------
create table if not exists tags (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  color       text not null default '#6366f1',
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_tags_updated before update on tags
  for each row execute function set_updated_at();

create table if not exists customer_tags (
  customer_id uuid not null references customers(id) on delete cascade,
  tag_id      uuid not null references tags(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (customer_id, tag_id)
);

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
create trigger trg_purchases_updated before update on purchases
  for each row execute function set_updated_at();

-- Fill in denormalized snapshots (name/amount/currency/billing) from the linked
-- rows on insert if the caller didn't supply them. Keeps history readable even
-- after a product or customer is renamed/deleted.
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
create trigger trg_forms_updated before update on forms
  for each row execute function set_updated_at();

create table if not exists form_submissions (
  id          uuid primary key default gen_random_uuid(),
  form_id     uuid not null references forms(id) on delete cascade,
  payload     jsonb not null default '{}'::jsonb,
  mapped      jsonb not null default '{}'::jsonb,
  customer_id uuid references customers(id) on delete set null,
  source_ip   text,
  status      text not null default 'received',
  created_at  timestamptz not null default now()
);
create index if not exists idx_submissions_form on form_submissions (form_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Helper: is the current auth user an active staff member?
create or replace function is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p where p.id = auth.uid() and p.archived_at is null
  );
$$;

alter table profiles          enable row level security;
alter table customers         enable row level security;
alter table tags              enable row level security;
alter table customer_tags     enable row level security;
alter table products          enable row level security;
alter table purchases         enable row level security;
alter table forms             enable row level security;
alter table form_submissions  enable row level security;

-- Profiles: staff can read all; users can update their own row (role changes are
-- guarded in app code / admin-only screens).
create policy profiles_read on profiles for select using (is_staff());
create policy profiles_self_update on profiles for update using (id = auth.uid());

-- Generic staff-full-access policy for the operational tables.
do $$
declare t text;
begin
  foreach t in array array['customers','tags','customer_tags','products','purchases','forms','form_submissions']
  loop
    execute format('create policy %I_staff_all on %I for all using (is_staff()) with check (is_staff());', t, t);
  end loop;
end $$;

-- Public forms are readable by anyone (needed to render the embedded form).
-- Only active, non-archived forms are exposed.
create policy forms_public_read on forms for select using (active and archived_at is null);
