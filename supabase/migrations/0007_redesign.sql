-- Lucy CRM — 0007: relational redesign migration (v1 → v2).
--
-- Migrates an EXISTING v1 database to the v2 schema:
--   * tags: event-sourced single table  → tags + customer_tags + tag_history
--   * calendars/integrations: products rows (kind) → calendars + bookings +
--     integration_settings
--   * customers: add CRM fields + split utm into first/latest touch
--   * automations: enrollment history JSON → automation_step_runs
--   * new tables: notes, activities, emails, deals, pipeline_stages,
--     attachments, audit_logs
--
-- Strategy: EXPAND (add new) → BACKFILL (copy data) → CONTRACT (drop old). Safe
-- to run on a fresh v2 DB too (backfills are guarded by table/column existence).
-- Run AFTER 0006. For a brand-new project just use schema.sql instead.
--
-- NOTE: review before running in production and take a backup. The CONTRACT
-- section (dropping old columns/rows) is at the very end and clearly marked so
-- you can run EXPAND+BACKFILL first, verify, then run CONTRACT separately.

create extension if not exists "pgcrypto";
create extension if not exists "btree_gist";
create extension if not exists "citext";
create extension if not exists "pg_trgm";

-- ==========================================================================
-- EXPAND — customers: new CRM columns + first/latest touch UTM
-- ==========================================================================
alter table customers add column if not exists phone text;
alter table customers add column if not exists company text;
alter table customers add column if not exists status text not null default 'lead';
alter table customers add column if not exists lead_source text;
alter table customers add column if not exists owner_id uuid references admins(id) on delete set null;
alter table customers add column if not exists created_by uuid references admins(id) on delete set null;
alter table customers add column if not exists utm_first_touch jsonb not null default '{}'::jsonb;
alter table customers add column if not exists utm_latest_touch jsonb not null default '{}'::jsonb;
alter table customers add column if not exists last_contacted_at timestamptz;
alter table customers add column if not exists merged_into uuid references customers(id) on delete set null;
alter table customers add column if not exists duplicate_of uuid references customers(id) on delete set null;

-- Backfill first-touch from the old single `utm` column, if it exists.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name='customers' and column_name='utm') then
    execute 'update customers set utm_first_touch = utm
             where utm_first_touch = ''{}''::jsonb and utm is not null';
  end if;
end $$;

-- Constrain status now that a default exists (drop first so re-runs are clean).
alter table customers drop constraint if exists chk_customers_status;
alter table customers add constraint chk_customers_status
  check (status in ('lead','active','customer','churned','archived'));
alter table customers drop constraint if exists chk_customers_not_self_merge;
alter table customers add constraint chk_customers_not_self_merge
  check (merged_into is null or merged_into <> id);
alter table customers drop constraint if exists chk_customers_not_self_dup;
alter table customers add constraint chk_customers_not_self_dup
  check (duplicate_of is null or duplicate_of <> id);

create index if not exists idx_customers_phone   on customers (phone) where phone is not null;
create index if not exists idx_customers_company on customers (lower(company)) where company is not null;
create index if not exists idx_customers_status  on customers (status) where archived_at is null;
create index if not exists idx_customers_owner   on customers (owner_id);
create index if not exists idx_customers_name_trgm    on customers using gin (name gin_trgm_ops);
create index if not exists idx_customers_company_trgm on customers using gin (company gin_trgm_ops);

-- ==========================================================================
-- EXPAND — new relational tag tables (keep the old `tags` table for now)
-- ==========================================================================
create table if not exists tags_v2 (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  color       text not null default '#6366f1',
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create table if not exists customer_tags (
  customer_id uuid not null references customers(id) on delete cascade,
  tag_id      uuid not null references tags_v2(id)   on delete cascade,
  assigned_by uuid references admins(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (customer_id, tag_id)
);
create index if not exists idx_customer_tags_tag on customer_tags (tag_id);
create table if not exists tag_history (
  id            uuid primary key default gen_random_uuid(),
  tag_id        uuid references tags_v2(id) on delete set null,
  customer_id   uuid references customers(id) on delete set null,
  action        text not null check (action in ('added','removed')),
  tag_name      text not null default '',
  customer_name text not null default '',
  actor_id      uuid references admins(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_tag_history_tag      on tag_history (tag_id, created_at desc);
create index if not exists idx_tag_history_customer on tag_history (customer_id, created_at desc);

-- BACKFILL tags from the v1 event log, IF the old shape is present
-- (old `tags` table had columns tag_id, kind, who_ids[], ...).
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name='tags' and column_name='kind') then
    -- Catalogue: one row per 'created' event (preserve tag_id as the new id).
    execute $mig$
      insert into tags_v2 (id, name, color, archived_at, created_at)
      select tag_id, name, color, archived_at, created_at
      from tags where kind = 'created'
      on conflict (id) do nothing
    $mig$;

    -- Current membership: fold add/removed events (latest per (customer,tag) wins).
    execute $mig$
      insert into customer_tags (customer_id, tag_id, assigned_at)
      select cid, tag_id, max(created_at)
      from (
        select t.tag_id, x.cid, t.kind, t.created_at,
               row_number() over (partition by t.tag_id, x.cid
                                   order by t.created_at desc) rn
        from tags t
        cross join lateral unnest(t.who_ids) as x(cid)
        where t.kind in ('added','removed')
      ) s
      where rn = 1 and kind = 'added'
      group by cid, tag_id
      on conflict do nothing
    $mig$;

    -- History: every add/removed event becomes an audit row (with snapshots).
    execute $mig$
      insert into tag_history (tag_id, customer_id, action, tag_name, customer_name, created_at)
      select t.tag_id, x.cid, t.kind, t.name,
             coalesce(t.who_names[x.ord], ''), t.created_at
      from tags t
      cross join lateral unnest(t.who_ids) with ordinality as x(cid, ord)
      where t.kind in ('added','removed')
    $mig$;
  end if;
end $$;

drop trigger if exists trg_tags_v2_updated on tags_v2;
create trigger trg_tags_v2_updated before update on tags_v2
  for each row execute function set_updated_at();

-- ==========================================================================
-- EXPAND — calendars + bookings, integration_settings
-- ==========================================================================
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
  weekly_hours       jsonb not null default '{}'::jsonb,
  busyness           jsonb not null default '{"enabled":false,"fraction":0,"epoch_days":0}'::jsonb,
  archived_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
drop trigger if exists trg_calendars_updated on calendars;
create trigger trg_calendars_updated before update on calendars
  for each row execute function set_updated_at();

create table if not exists bookings (
  id                uuid primary key default gen_random_uuid(),
  calendar_id       uuid not null references calendars(id) on delete cascade,
  customer_id       uuid references customers(id) on delete set null,
  status            text not null default 'confirmed' check (status in ('pending','confirmed','canceled')),
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  attendee_name     text not null,
  attendee_email    citext not null,
  notes             text,
  google_event_id   text,
  stripe_session_id text,
  hold_expires_at   timestamptz,
  amount            numeric(12,2),
  currency          char(3),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint chk_booking_time check (ends_at > starts_at),
  constraint excl_bookings_no_overlap
    exclude using gist (calendar_id with =, tstzrange(starts_at, ends_at) with &&)
    where (status <> 'canceled')
);
create index if not exists idx_bookings_calendar_time on bookings (calendar_id, starts_at);
create index if not exists idx_bookings_customer on bookings (customer_id);
create index if not exists idx_bookings_pending_holds on bookings (hold_expires_at) where status='pending';
drop trigger if exists trg_bookings_updated on bookings;
create trigger trg_bookings_updated before update on bookings
  for each row execute function set_updated_at();

create table if not exists integration_settings (
  provider     text primary key check (provider in ('google','stripe','leadconnector')),
  connected    boolean not null default false,
  config       jsonb not null default '{}'::jsonb,
  connected_at timestamptz,
  updated_at   timestamptz not null default now()
);
drop trigger if exists trg_integration_updated on integration_settings;
create trigger trg_integration_updated before update on integration_settings
  for each row execute function set_updated_at();
insert into integration_settings (provider) values ('google'),('stripe'),('leadconnector')
  on conflict (provider) do nothing;

-- BACKFILL calendars + bookings + integrations from v1 products, IF present.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name='products' and column_name='kind') then
    -- Calendars (copy config out of the `calendar` JSONB).
    execute $mig$
      insert into calendars (id, name, slug, description, price, currency, paid,
        slot_minutes, utc_offset_minutes, timezone_label, lead_time_minutes,
        window_days, weekly_hours, busyness, archived_at, created_at)
      select p.id, p.name, coalesce(p.slug, p.id::text), p.description, p.price, p.currency,
        coalesce((p.calendar->>'paid')::boolean, false),
        coalesce((p.calendar->>'slot_minutes')::int, 30),
        coalesce((p.calendar->>'utc_offset_minutes')::int, 0),
        coalesce(p.calendar->>'timezone_label', 'UTC'),
        coalesce((p.calendar->>'lead_time_minutes')::int, 0),
        coalesce((p.calendar->>'window_days')::int, 30),
        coalesce(p.calendar->'weekly_hours', '{}'::jsonb),
        coalesce(p.calendar->'busyness', '{"enabled":false,"fraction":0,"epoch_days":0}'::jsonb),
        p.archived_at, p.created_at
      from products p where p.kind = 'calendar'
      on conflict (id) do nothing
    $mig$;

    -- Bookings (expand the JSON bookings[] array into rows).
    execute $mig$
      insert into bookings (calendar_id, customer_id, status, starts_at, ends_at,
        attendee_name, attendee_email, notes, google_event_id, stripe_session_id,
        hold_expires_at, amount, currency, created_at)
      select p.id,
        nullif(b->>'customer_id','')::uuid,
        coalesce(b->>'status','confirmed'),
        (b->>'start')::timestamptz, (b->>'end')::timestamptz,
        coalesce(b->>'name',''), coalesce(b->>'email',''),
        b->>'notes', b->>'google_event_id', b->>'stripe_session_id',
        nullif(b->>'hold_expires_at','')::timestamptz,
        nullif(b->>'amount','')::numeric, nullif(b->>'currency',''),
        coalesce((b->>'created_at')::timestamptz, now())
      from products p
      cross join lateral jsonb_array_elements(coalesce(p.calendar->'bookings','[]'::jsonb)) b
      where p.kind = 'calendar'
        and (b->>'start') is not null and (b->>'end') is not null
    $mig$;

    -- Integration settings (one product row of kind='integration' → 3 rows).
    execute $mig$
      update integration_settings s set
        connected = coalesce((p.integrations->'google'->>'connected')::boolean, false),
        config = coalesce(p.integrations->'google','{}'::jsonb),
        connected_at = nullif(p.integrations->'google'->>'connected_at','')::timestamptz
      from products p where p.kind='integration' and s.provider='google'
    $mig$;
    execute $mig$
      update integration_settings s set config = coalesce(p.integrations->'stripe','{}'::jsonb)
      from products p where p.kind='integration' and s.provider='stripe'
    $mig$;
  end if;
end $$;

-- ==========================================================================
-- EXPAND — new CRM entities
-- ==========================================================================
create table if not exists pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null, position int not null default 0,
  is_won boolean not null default false, is_lost boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_pipeline_stage_name on pipeline_stages (lower(name));

create table if not exists deals (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  title text not null default '',
  stage_id uuid references pipeline_stages(id) on delete set null,
  value numeric(12,2) not null default 0 check (value >= 0),
  currency char(3) not null default 'USD',
  probability int not null default 0 check (probability between 0 and 100),
  expected_close_date date,
  owner_id uuid references admins(id) on delete set null,
  status text not null default 'open' check (status in ('open','won','lost')),
  closed_at timestamptz, archived_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_deals_customer on deals (customer_id);
create index if not exists idx_deals_stage on deals (stage_id);
create index if not exists idx_deals_status on deals (status) where archived_at is null;
drop trigger if exists trg_deals_updated on deals;
create trigger trg_deals_updated before update on deals for each row execute function set_updated_at();

create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  body text not null, created_by uuid references admins(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_notes_customer on notes (customer_id, created_at desc);
drop trigger if exists trg_notes_updated on notes;
create trigger trg_notes_updated before update on notes for each row execute function set_updated_at();

create table if not exists emails (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  provider_id text, subject text not null default '', body text,
  status text not null default 'queued'
    check (status in ('queued','sent','delivered','opened','clicked','bounced','failed')),
  sent_at timestamptz, opened_at timestamptz, clicked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_emails_customer on emails (customer_id, created_at desc);
create index if not exists idx_emails_status on emails (status);

create table if not exists attachments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  filename text not null, mime_type text, size bigint check (size is null or size >= 0),
  url text not null, uploaded_by uuid references admins(id) on delete set null,
  uploaded_at timestamptz not null default now()
);
create index if not exists idx_attachments_customer on attachments (customer_id, uploaded_at desc);

create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  type text not null check (type in (
    'email_sent','email_opened','email_clicked','purchase','booking',
    'form_submitted','tag_added','tag_removed','note','imported',
    'stage_changed','deal_created','deal_won','deal_lost','manual')),
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references admins(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_activities_customer on activities (customer_id, created_at desc);
create index if not exists idx_activities_type on activities (type, created_at desc);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references admins(id) on delete set null,
  action text not null, entity_type text, entity_id uuid,
  before jsonb, after jsonb, ip text,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_actor on audit_logs (actor_id, created_at desc);
create index if not exists idx_audit_entity on audit_logs (entity_type, entity_id, created_at desc);

-- ==========================================================================
-- EXPAND — automation step runs (from enrollment history JSON)
-- ==========================================================================
create table if not exists automation_step_runs (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references automation_enrollments(id) on delete cascade,
  step_index int not null, step_type text not null check (step_type in ('email','tag','wait')),
  detail text not null default '', message_id text, error text,
  ran_at timestamptz not null default now()
);
create index if not exists idx_step_runs_enrollment on automation_step_runs (enrollment_id, ran_at);

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name='automation_enrollments' and column_name='history') then
    execute $mig$
      insert into automation_step_runs (enrollment_id, step_index, step_type, detail, message_id, error, ran_at)
      select e.id, coalesce((h->>'step_index')::int,0), coalesce(h->>'type','email'),
             coalesce(h->>'detail',''), h->>'message_id', h->>'error',
             coalesce((h->>'at')::timestamptz, now())
      from automation_enrollments e
      cross join lateral jsonb_array_elements(coalesce(e.history,'[]'::jsonb)) h
    $mig$;
  end if;
end $$;

-- ==========================================================================
-- CONTRACT — drop v1 structures. Review + verify backfill BEFORE running this.
-- Commented out by default so EXPAND+BACKFILL can be applied and verified first.
-- Uncomment (or run as a follow-up) once the app reads the v2 tables.
-- ==========================================================================
-- -- Retire the old event-sourced tags table and swap tags_v2 → tags.
-- drop table if exists tags cascade;
-- alter table tags_v2 rename to tags;
-- alter index if exists uq_tags_name_live rename to uq_tags_name_live; -- (recreate below)
-- create unique index if not exists uq_tags_name_live on tags (lower(name)) where archived_at is null;
--
-- -- Remove calendar/integration rows + the discriminator from products.
-- delete from products where kind in ('calendar','integration');
-- alter table products drop column if exists kind;
-- alter table products drop column if exists slug;
-- alter table products drop column if exists calendar;
-- alter table products drop column if exists integrations;
-- alter table products drop column if exists source_project_id;
--
-- -- Remove the old single utm column + enrollment history JSON.
-- alter table customers drop column if exists utm;
-- alter table automation_enrollments drop column if exists history;
