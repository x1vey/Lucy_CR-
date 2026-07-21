-- Lucy CRM — tagging history ledger
-- Mirrors src/lib/types.ts (TagEvent) and the in-memory store.
--
-- Design: append-only, same philosophy as `purchases`. Every event snapshots
-- the tag name/color and (where relevant) the contact name + actor, so the
-- timeline stays readable after a tag is renamed/deleted or a contact archived.
--   * tag_created  — a new tag was defined (customer_id null)
--   * tag_applied  — a tag was added to a contact
--   * tag_removed  — a tag was removed from a contact
--   * tag_deleted  — a tag was deleted (customer_id null)

create table if not exists tag_events (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('tag_created','tag_applied','tag_removed','tag_deleted')),
  tag_id        uuid references tags(id) on delete set null,
  tag_name      text not null default '',   -- snapshot
  tag_color     text not null default '',   -- snapshot
  customer_id   uuid references customers(id) on delete set null,
  customer_name text,                        -- snapshot (null for lifecycle events)
  actor_id      uuid references profiles(id) on delete set null,
  actor_name    text,                        -- snapshot
  created_at    timestamptz not null default now()
);
create index if not exists idx_tag_events_tag on tag_events (tag_id);
create index if not exists idx_tag_events_customer on tag_events (customer_id);
create index if not exists idx_tag_events_created on tag_events (created_at desc);

-- RLS: staff-only, same as the other operational tables. The ledger is
-- append-only in practice (the app never updates/deletes rows), but we leave
-- full access to staff for administrative correction.
alter table tag_events enable row level security;
create policy tag_events_staff_all on tag_events
  for all using (is_staff()) with check (is_staff());
