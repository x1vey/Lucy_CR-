-- Lucy CRM — email automations (LeadConnector send transport).
--
-- A workflow builder for sequences like form → email → tag → wait → email.
-- Lucy owns the sequencing/timing; LeadConnector (GoHighLevel) sends the mail.
--
-- Unlike calendars (which live inside a product row), automations get their OWN
-- tables: the runner must query DUE enrollments across every automation by
-- next_run_at, which a JSON-in-a-row model can't index soundly. The step
-- *definition* stays as an ordered JSONB array on the automation row.
--
-- Run AFTER 0005_calendars.sql on an existing DB, or just use schema.sql on a
-- fresh project. Idempotent.

create table if not exists automations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  -- { kind: 'form_submission'|'tag_added'|'manual', form_id?, tag_id? }
  trigger     jsonb not null default '{"kind":"manual"}'::jsonb,
  -- ordered AutomationStep[] (email | tag | wait)
  steps       jsonb not null default '[]'::jsonb,
  active      boolean not null default true,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
drop trigger if exists trg_automations_updated on automations;
create trigger trg_automations_updated before update on automations
  for each row execute function set_updated_at();

create table if not exists automation_enrollments (
  id             uuid primary key default gen_random_uuid(),
  automation_id  uuid not null references automations(id) on delete cascade,
  customer_id    uuid not null references customers(id) on delete cascade,
  customer_name  text not null default '',   -- snapshot
  customer_email text,                        -- snapshot
  status         text not null default 'active'
                   check (status in ('active','completed','canceled','failed')),
  current_step   int not null default 0,      -- index of the NEXT step to run
  next_run_at    timestamptz,                 -- when the runner should next act (null = done)
  context        jsonb not null default '{}'::jsonb,  -- merge-field snapshot
  history        jsonb not null default '[]'::jsonb,  -- per-step audit log
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_enrollments_due
  on automation_enrollments (status, next_run_at);
create index if not exists idx_enrollments_automation
  on automation_enrollments (automation_id);
create index if not exists idx_enrollments_customer
  on automation_enrollments (customer_id);
-- One active enrollment per (automation, customer) — re-enrolling while active
-- is a no-op (enforced in app code; this partial index makes it cheap to check).
create unique index if not exists idx_enrollments_active_unique
  on automation_enrollments (automation_id, customer_id)
  where status = 'active';
drop trigger if exists trg_enrollments_updated on automation_enrollments;
create trigger trg_enrollments_updated before update on automation_enrollments
  for each row execute function set_updated_at();

alter table automations           enable row level security;
alter table automation_enrollments enable row level security;

-- ---------------------------------------------------------------------------
-- Atomically claim due enrollments so two overlapping ticks can't double-send.
-- Grabs up to p_limit active enrollments whose next_run_at has passed, pushes
-- their next_run_at forward (a short lease), and returns them.
-- ---------------------------------------------------------------------------
create or replace function claim_due_enrollments(p_now timestamptz, p_limit int)
returns setof automation_enrollments language plpgsql as $$
begin
  return query
  update automation_enrollments e
     set next_run_at = p_now + interval '5 minutes',  -- lease; the runner sets the real value
         updated_at = now()
   where e.id in (
     select id from automation_enrollments
      where status = 'active'
        and next_run_at is not null
        and next_run_at <= p_now
      order by next_run_at asc
      limit p_limit
      for update skip locked
   )
   returning e.*;
end;
$$;
