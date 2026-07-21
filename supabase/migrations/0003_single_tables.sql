-- Lucy CRM — collapse to one table per concept.
--
-- Changes from 0001/0002:
--   * DROP profiles (+ its triggers/functions) and the whole auth/staff model.
--   * DROP customers.owner_id (no profiles to reference).
--   * MERGE tags + customer_tags + tag_events into a single `tags` activity log
--     (kind = created/added/removed, with a multi-contact who_ids/who_names).
--   * Simplify RLS (no is_staff); the app uses the service-role key.
--
-- This migration is written to run AFTER 0001_init + 0002_tag_events on an
-- existing DB. On a fresh project just run supabase/schema.sql instead.

-- 1) Drop the old tag tables (data model changed shape entirely).
drop table if exists tag_events cascade;
drop table if exists customer_tags cascade;

-- 2) Drop the old single-row tags table and recreate it as the activity log.
drop table if exists tags cascade;
create table tags (
  id          uuid primary key default gen_random_uuid(),
  tag_id      uuid not null,
  kind        text not null check (kind in ('created','added','removed')),
  name        text not null,
  color       text not null default '#6366f1',
  who_ids     uuid[] not null default '{}',
  who_names   text[] not null default '{}',
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists idx_tags_tag_id on tags (tag_id);
create index if not exists idx_tags_kind on tags (kind);
create index if not exists idx_tags_created on tags (created_at desc);
create index if not exists idx_tags_who_ids on tags using gin (who_ids);

-- 3) Drop the profiles/auth model.
alter table if exists customers drop column if exists owner_id;
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists handle_new_user() cascade;
drop function if exists is_staff() cascade;
drop table if exists profiles cascade;

-- 4) Reset RLS to the no-auth model.
alter table tags enable row level security;
-- Old staff-only policies referenced is_staff(); they vanish with the tables /
-- function above. Nothing else needed: service-role bypasses RLS, and the
-- public forms_public_read policy from 0001 still applies to `forms`.
