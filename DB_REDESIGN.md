# Lucy CRM — Database Redesign v2

**Role:** principal architect / PostgreSQL expert / CRM systems designer.
**Scope:** redesign the **database layer only**. The application architecture is
preserved — repository pattern, server actions, soft deletes (`archived_at`),
UUID PKs, snapshot fields, JSON for *definitions*, relational *runtime*, Postgres.

The authoritative, runnable DDL is **`supabase/schema_v2.sql`** (validated: it
runs clean and idempotent on PostgreSQL, the booking overlap constraint and all
FK cascades were tested live). This document is the reasoning: ER diagram, table
list, philosophy, per-change rationale + trade-offs, migration strategy,
scalability review, and an evaluation of the old design.

---

## 1. Database philosophy

1. **Relational by default; JSON only for genuine configuration.** A column is
   JSON only when its shape is authored by a user/developer and never joined or
   aggregated across rows: form field schemas, automation definitions, per-calendar
   weekly-hours config, contact custom fields, UI/provider config. Everything
   *transactional* or *relational* (bookings, purchases, tags, deals, emails,
   activities) is real rows with real foreign keys.
2. **One source of truth per fact.** Current tag membership is a table you read
   directly, not a projection you fold from an event log. History is a *separate*
   audit trail that can be rebuilt/dropped without affecting correctness.
3. **Integrity in the database, not just the app.** Overlap prevention, uniqueness,
   value ranges, and referential rules are enforced by constraints so they hold
   even under concurrency and outside the app’s happy path.
4. **Prefer clean modeling over few tables.** The prior design optimized for table
   count (calendars/integrations stuffed into `products`, tags as one log). v2
   deliberately adds tables where that buys clarity, queryability, and integrity.
5. **Soft-delete business data, hard-append audit data.** `archived_at` on
   entities; `activities`, `tag_history`, `audit_logs`, `automation_step_runs` are
   append-only.
6. **Snapshots on historical rows.** Ledger/audit rows copy names at write time so
   they stay readable after a rename/delete.

---

## 2. Complete table list (22 tables)

| # | Table | Purpose | JSON? |
|---|-------|---------|-------|
| 1 | `admins` | Operators who log in | – |
| 2 | `customers` | Contacts/leads (expanded) | custom_fields, utm_* |
| 3 | `tags` | Tag catalogue | – |
| 4 | `customer_tags` | **Current** membership (join) | – |
| 5 | `tag_history` | Tag add/remove audit trail | – |
| 6 | `products` | Plain sellables only | – |
| 7 | `purchases` | Sales ledger (snapshots kept) | – |
| 8 | `calendars` | Booking calendar config | weekly_hours, busyness |
| 9 | `bookings` | **Relational** bookings | – |
| 10 | `integration_settings` | One row per provider | config |
| 11 | `forms` | Form definitions | fields, mapping |
| 12 | `form_submissions` | Submissions | payload, mapped, utm |
| 13 | `pipeline_stages` | Configurable deal stages | – |
| 14 | `deals` | Sales pipeline | – |
| 15 | `notes` | Long-form per-contact notes | – |
| 16 | `emails` | Outbound email history | – |
| 17 | `attachments` | Files linked to a contact | – |
| 18 | `activities` | Customer-facing timeline | payload |
| 19 | `audit_logs` | **System** audit (config/admin) | before/after |
| 20 | `automations` | Automation definitions | trigger, steps |
| 21 | `automation_enrollments` | Runtime state | context |
| 22 | `automation_step_runs` | Per-step execution log | – |

---

## 3. ER diagram

```
                                  ┌───────────┐
                                  │  admins   │
                                  └─────┬─────┘
        owner_id / created_by / actor_id / assigned_by / uploaded_by
   ┌──────────────┬──────────────┬───────────┬──────────┬─────────────┐
   │              │              │           │          │             │
   ▼              ▼              ▼           ▼          ▼             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              customers                                    │
│  (email, phone, company, status, lead_source, owner_id, created_by,       │
│   utm_first_touch, utm_latest_touch, last_contacted_at,                   │
│   merged_into→customers, duplicate_of→customers, hidden, archived_at)     │
└───┬───────┬────────┬────────┬────────┬────────┬────────┬────────┬─────────┘
    │1     *│1      *│1      *│1      *│1      *│1      *│1      *│1        │*
    ▼       ▼        ▼        ▼        ▼        ▼        ▼        ▼         ▼
customer_ purchases bookings  notes   emails  attach-  deals   form_sub-  activities
  tags       │        │                        ments     │      missions      │
    │*        │*       │*                                 │*        │*         │
    ▼1        ▼0..1    ▼1                                 ▼0..1     ▼1         (payload jsonb)
  tags     products  calendars                       pipeline_   forms
    │                    (weekly_hours jsonb)          stages    (fields jsonb)
    ▼ (audit)
 tag_history

automations 1───* automation_enrollments 1───* automation_step_runs
   (steps jsonb)        (context jsonb)              (email|tag|wait log)

integration_settings   (provider PK: google | stripe | leadconnector)
audit_logs             (actor_id→admins, entity_type/entity_id, before/after)

Legend: 1───* one-to-many.  →table = FK.  jsonb = configuration kept as JSON.
Booking↔customer is 0..1 (a booking may exist before/without a CRM contact).
```

---

## 4. Requested changes — what changed and why (with trade-offs)

### 4.1 Replace event-sourced tags → `tags` / `customer_tags` / `tag_history`
**Old:** one `tags` table where every row was an event (`created`/`added`/
`removed`); current membership was *derived* by folding all rows in app code.
**New:**
- `tags` = catalogue (id, name, color, archived_at). Unique live name.
- `customer_tags` = current membership, **composite PK `(customer_id, tag_id)`**.
  “Does this contact have this tag?” and “who has tag X?” are direct indexed
  lookups. Duplicates are impossible (PK). FKs cascade on delete.
- `tag_history` = **separate** append-only audit (`added`/`removed` + snapshots +
  actor). **Not the source of truth** — you can truncate it without affecting
  membership.
- **Bulk assignment** stays trivial: one multi-row `INSERT … ON CONFLICT DO
  NOTHING` into `customer_tags` + a matching batch into `tag_history`.

**Trade-off:** two writes per change (membership + history) instead of one append.
Worth it: membership reads go from O(all events, folded in JS) to O(1) indexed,
which is the operation the UI does constantly. *(Verified live: composite PK
rejects duplicate membership; deleting a tag cascades membership away.)*

### 4.2 Separate bookings → `calendars` + `bookings`
**Old:** calendars were `products` rows with a `calendar` JSONB blob that also
held a `bookings[]` array; overlap was checked in app code + a `book_slot` RPC.
**New:**
- `calendars` is its own table. Config that is *genuinely configuration*
  (weekly_hours, busyness, slot length, offset) stays JSONB.
- `bookings` are real rows with `starts_at`/`ends_at timestamptz`, status, and a
  nullable `customer_id`.
- **Conflict detection is now a database guarantee**, not app logic:
  ```sql
  exclude using gist (calendar_id with =, tstzrange(starts_at, ends_at) with &&)
    where (status <> 'canceled')
  ```
  Two non-canceled bookings on the same calendar can never overlap — enforced by
  Postgres even under concurrent requests. This *replaces* the `book_slot` RPC and
  the app-level race window. *(Verified live: overlapping insert is rejected;
  adjacent/non-overlapping insert succeeds.)*
- **Reporting is efficient**: index on `(calendar_id, starts_at)`; a partial index
  on pending holds (`where status='pending'`) makes hold-expiry sweeps cheap.

**Trade-off:** needs the `btree_gist` extension (standard on Supabase). Bookings no
longer travel with the calendar row, so the app makes a second query — a clear win
for scale and integrity.

### 4.3 Separate integration settings → `integration_settings`
**Old:** a reserved `products` row of `kind='integration'` holding an
`integrations` JSONB blob.
**New:** a dedicated table keyed by `provider` (`google`|`stripe`|`leadconnector`),
one row each, seeded on create. Runtime secrets (e.g. Google refresh token) live in
a small `config` JSONB (that *is* provider-specific configuration). Adding a
provider = add to the `CHECK` list + insert a row.

**Trade-off:** none meaningful — it removes the “magic hidden product” hack and the
`kind` discriminator’s third value. `products` is now purely sellables.

### 4.4 Reduce JSON usage
Kept JSON for **definitions/config**: `automations.trigger`/`steps`,
`forms.fields`/`mapping`, `customers.custom_fields`, `calendars.weekly_hours`,
`integration_settings.config`, `activities.payload`, `audit_logs.before/after`.
Removed JSON for **transactional/relational** data: bookings, tag membership, and
the automation `history` array (now `automation_step_runs` rows). Rule of thumb:
*if you ever need to filter, sort, join, or aggregate across the items, it’s a
table, not a JSON array.*

### 4.5 Improve `customers`
Added the requested `phone, company, status, owner_id, lead_source, created_by,
last_contacted_at` (kept `hidden`, `archived_at`). **Recommended additions:**
- `utm_first_touch` **and** `utm_latest_touch` (per the UTM request — first-touch
  immutable, latest-touch updated per visit).
- `merged_into` / `duplicate_of` (per the duplicate-contacts request) as self-FKs,
  with CHECKs preventing self-reference.
- `email` as `citext` with a **partial unique index** over live, non-merged rows
  (the app upserts-by-email and merges dups; hard global uniqueness would break
  that).
- Trigram GIN indexes on `name`/`company` for fuzzy global search/typeahead.

Other CRM fields I’d recommend but left out to avoid gold-plating (add when
needed): `job_title`, `timezone`, `preferred_channel`, `do_not_contact boolean`,
`address` fields, `lifecycle_stage` (if distinct from `status`), and a
`secondary_email`. Multiple emails/phones per contact would justify child tables
(`customer_emails`, `customer_phones`) — deferred until the business needs it.

### 4.6–4.13 New/kept entities
- **`notes`** — as specified, `+ updated_at` and `created_by→admins`.
- **`activities`** — unified per-contact timeline; `type` CHECK enumerates the
  requested events; `payload` JSONB because shape varies by type and it’s display
  data, not something we join across.
- **`purchases`** — unchanged intent; **snapshots kept** (`customer_name`,
  `product_name`). `on delete restrict` for the customer FK (don’t silently orphan
  revenue), `set null` for product.
- **`emails`** — as specified; status enum incl. delivered/opened/clicked/bounced;
  indexed by customer + provider_id + status.
- **`deals`** + **`pipeline_stages`** — pipeline as a first-class entity. Stages are
  a small ordered lookup (configurable, rename-safe) instead of a bare text column;
  `deals.status` (open/won/lost) plus `stage_id`, `value`, `probability`,
  `expected_close_date`, `owner_id`.
- **`forms`** — definitions **kept as JSON**. Reasoning: form fields are authored,
  read/rendered whole, versioned as a unit, and never queried field-by-field across
  forms; normalizing into `form_fields`/`form_field_options` tables adds 2–3 tables
  and multi-row reads/writes for zero query benefit. Submissions *are* relational.
- **`automations`** — definitions **kept as JSON**, runtime **relational**. The one
  change: the enrollment’s growing `history[]` JSON array became the
  `automation_step_runs` table (queryable, keeps the hot enrollment row small).
- **`audit_logs`** — **system** audit (who changed what config/admin/integration),
  explicitly **separate** from `activities` (a *contact’s* journey). Append-only,
  never soft-deleted, with `before`/`after` JSON snapshots.
- **`attachments`** — as specified; `size bigint` with a non-negative CHECK,
  `uploaded_by→admins`.

---

## 5. Indexes (all important lookup paths)

- **Customer search:** `email` (partial unique), `phone`, `lower(company)`,
  `status` (partial), `owner_id`, `created_at desc`, `last_contacted_at desc`, plus
  **trigram GIN** on `name` and `company` for fuzzy search.
- **Bookings:** `(calendar_id, starts_at)`, `customer_id`, `status`,
  `stripe_session_id` (partial), pending-hold partial index; overlap **exclusion**
  index via GiST.
- **Purchases:** `customer_id`, `product_id`, `status`, `purchased_at desc`,
  `external_ref` (partial).
- **Deals:** `customer_id`, `stage_id`, `owner_id`, `status` (partial),
  `expected_close_date`.
- **Tags:** `customer_tags` PK + `tag_id` index; `tag_history` by tag and by
  customer (time-desc).
- **Timeline/email/notes/attachments:** each indexed by `(customer_id, created_at
  desc)`; `emails` also by `provider_id` and `status`; `activities` also by
  `(type, created_at desc)`.
- **Automation runner hot path:** partial `(status, next_run_at) where
  status='active'`, unique active `(automation_id, customer_id)`.

Partial indexes (`where archived_at is null`, `where status=…`) keep them small and
match the queries the app actually runs.

---

## 6. Constraints, cascades, uniqueness (summary)

- **PKs:** UUID `gen_random_uuid()` everywhere except `customer_tags` (composite
  natural PK) and `integration_settings` (`provider` text PK — a natural key).
- **FK cascade rules (deliberate):**
  - Child data that is meaningless without its parent → `on delete cascade`
    (`customer_tags`, `bookings`←calendar, `notes`, `attachments`, `deals`,
    `form_submissions`, `automation_enrollments`, `automation_step_runs`,
    `activities`).
  - Revenue must not silently vanish → `purchases.customer_id … on delete
    restrict`.
  - Optional links degrade gracefully → `on delete set null`
    (`bookings.customer_id`, `*.owner_id/created_by/actor_id`, `emails.customer_id`,
    `deals.stage_id`, `purchases.product_id`, `merged_into`, `duplicate_of`).
- **CHECKs:** enum-like status/role/kind columns; `price/value/amount >= 0`;
  `probability 0..100`; `ends_at > starts_at`; purchase period ordering; no
  self-merge / self-duplicate; slot/window ranges.
- **Uniqueness:** `admins.email`; live `customers.email` (partial); live tag name
  (partial); `products`/`forms`/`calendars` slugs & tokens; one active enrollment
  per (automation, customer); pipeline stage name.
- **Exclusion:** booking overlap per calendar (GiST).

*(All of the above load clean and idempotent; overlap + PK-dedup + cascades were
exercised on a live PostgreSQL instance.)*

---

## 7. Migration strategy (expand → backfill → contract)

Zero-downtime, reversible, done as numbered migrations (`0007_…` onward) so both
`schema.sql` and the migration chain stay authoritative. **Never** drop old
structures until the app is switched over and backfill is verified.

**Phase 1 — EXPAND (add new, keep old):**
1. `create extension btree_gist, citext, pg_trgm`.
2. Create `calendars`, `bookings`, `integration_settings`, `tags`(new),
   `customer_tags`, `tag_history`, `pipeline_stages`, `deals`, `notes`, `emails`,
   `attachments`, `activities`, `audit_logs`, `automation_step_runs`.
3. `alter table customers add column …` for the new fields (nullable / defaulted).
   Add `utm_first_touch`/`utm_latest_touch`; backfill `utm_first_touch` from the
   existing `utm` column.

**Phase 2 — BACKFILL (copy data, dual-write):**
4. **Tags:** insert the old `created` rows into `tags`; derive current membership
   (the existing fold) into `customer_tags`; copy `added`/`removed` events into
   `tag_history`. Point the repository’s tag functions at the new tables.
5. **Calendars/bookings:** for each `products` row with `kind='calendar'`, insert a
   `calendars` row (copy config) and expand its `calendar->bookings[]` JSON into
   `bookings` rows (map `start/end`→`starts_at/ends_at`).
6. **Integrations:** copy the `kind='integration'` product’s `integrations` JSON
   into three `integration_settings` rows.
7. **Automations:** expand each enrollment’s `history[]` into `automation_step_runs`
   rows; drop the JSON column in Phase 3.
8. Have the repository **dual-write** (old + new) briefly if you want an instant
   rollback path; otherwise switch reads to new tables behind the repo facade —
   the app layer above `src/lib/db` doesn’t change.

**Phase 3 — CONTRACT (remove old):**
9. Delete the `kind` discriminator + `calendar`/`integrations` columns from
   `products`; drop `kind IN ('calendar','integration')` rows.
10. Drop the old event-sourced `tags` structure and `book_slot`/`claim_due` helpers
    that are superseded (keep `claim_due_enrollments`; it’s still the runner’s
    lease).
11. Remove the enrollment `history` JSON column.

Because everything routes through the repository pattern (`src/lib/db`), the UI and
server actions are untouched — only `memory.ts`/`supabase.ts` implementations move
to the new tables. That’s the whole point of keeping the app architecture.

---

## 8. Scalability review (target: tens of thousands of contacts, solo-maintainable)

- **Tag membership** is now O(1) indexed instead of an app-side fold over an event
  log — the single biggest read-path win. Bulk assignment is one batched insert.
- **Bookings** as rows + a partial `(calendar_id, starts_at)` index make
  availability and reporting index-scans; the exclusion constraint removes the
  double-booking race entirely. Row growth is bounded per calendar and prunable.
- **Timeline** (`activities`) is the highest-volume table long-term (one row per
  event). Indexed by `(customer_id, created_at desc)`. If it grows into millions,
  **range-partition by `created_at`** (monthly) — the schema is partition-ready
  (no cross-partition unique needed). Same option for `emails`/`audit_logs`.
- **Automation runner** hot path is a tiny partial index; `automation_step_runs`
  keeps the enrollment row small so the “claim due” scan stays fast.
- **Search** uses trigram GIN on name/company — good to tens of thousands without a
  separate search service; add `tsvector`/full-text or Postgres FTS if needed.
- **Single-tenant**: no tenant scoping needed; service-role connection bypasses RLS
  (RLS still enabled as defense-in-depth). If it ever goes multi-tenant, add
  `tenant_id` + composite indexes + real RLS policies — the clean FK graph makes
  that mechanical.
- **`numeric(12,2)`** for money (never float). `citext` avoids `lower()` gymnastics
  on email. `timestamptz` everywhere (store UTC).

---

## 9. PostgreSQL best practices applied

- `timestamptz` (not `timestamp`); `numeric` for money; `citext` for emails;
  `char(3)` for currency codes.
- Partial & expression indexes matched to real queries (not blanket indexing).
- Integrity in the DB: exclusion constraint, CHECKs, FKs with intentional cascade
  vs restrict vs set-null.
- One shared `set_updated_at()` trigger; idempotent DDL (`if not exists`,
  `or replace`, `on conflict do nothing`).
- Extensions declared up front (`pgcrypto`, `btree_gist`, `citext`, `pg_trgm`).
- Append-only audit tables kept out of the soft-delete model.
- Natural keys where they’re genuinely natural (`integration_settings.provider`,
  `customer_tags` pair); surrogate UUIDs elsewhere.

---

## 10. Evaluation of the previous design

- **Unnecessary complexity:** the `products.kind` discriminator overloaded one
  table with three unrelated concepts (sellables, calendars, integration secrets),
  forcing every product query to filter `kind` and creating a “magic hidden row”.
  → Split into `products`, `calendars`, `integration_settings`.
- **Overuse of JSON:** bookings and the automation `history` lived in JSON arrays —
  unqueryable, unindexable, race-prone on append. → Promoted to tables. JSON
  retained only for true config/definitions.
- **Poor normalization / derived source-of-truth:** tag membership was *computed*
  from an event log on every read, so the read path scaled with total history and
  the “current state” had no index. → Real membership table + separate history.
- **Missing entities for a real CRM:** no pipeline/deals, notes, activity timeline,
  email history, attachments, system audit log, or duplicate handling. → Added.
- **Missing integrity:** double-booking prevention lived only in app code (a
  check-then-write race). → DB exclusion constraint.
- **Simplifications recommended & taken:** drop the `kind` hack; stop deriving
  membership; keep forms/automation *definitions* as JSON (normalizing them buys
  nothing and costs multi-row reads) — normalize only the *transactional* data.

**Net:** more tables (10 → 22), but each models one thing, integrity moves into the
database, the hottest read paths become indexed lookups, and the app layer above
the repository is untouched. That is the intended trade: clean relational modeling
over a minimal table count, sized for tens of thousands of contacts and a solo
maintainer.
