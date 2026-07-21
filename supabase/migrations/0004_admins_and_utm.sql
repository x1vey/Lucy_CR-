-- Lucy CRM — add admin logins + UTM capture.
--
-- Adds:
--   * admins table (CRM operators who can log in; email + scrypt hash + role)
--   * form_submissions.utm (jsonb) to store captured utm_* params
--
-- Run AFTER 0003_single_tables.sql on an existing DB, or just use schema.sql on
-- a fresh project.

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

-- No RLS policy on admins on purpose: only the service-role key may read it, so
-- password hashes are never exposed to the anon key.
alter table admins enable row level security;

-- UTM params captured from the embedding page's URL, per submission.
alter table form_submissions add column if not exists utm jsonb not null default '{}'::jsonb;

-- First-touch UTM attribution stored on the contact (filled once, never
-- overwritten by later submissions — see setCustomerUtm).
alter table customers add column if not exists utm jsonb not null default '{}'::jsonb;

-- Seed an initial owner so you can log in. CHANGE THIS PASSWORD.
-- Hash below is scrypt for "admin1234"; replace via the Admins screen after login.
insert into admins (email, name, password_hash, role)
values (
  'admin@lucy.crm',
  'Lucy Admin',
  'scrypt$0a1b2c3d4e5f60718293a4b5c6d7e8f9$9337eeb9b566f6a4c21f98b2124ffad8f66fec0f792a5ca8790dcd0734f4e3cdc53ced1e7cd70eca75235da02c764020c60c74185673eedc383db46c3cabcb98',
  'owner'
)
on conflict (email) do nothing;
