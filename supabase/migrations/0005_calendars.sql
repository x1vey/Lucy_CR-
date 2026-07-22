-- Lucy CRM — booking calendars (Calendly-style) + global integrations.
--
-- Calendars are stored IN the products table: a product gains a `kind`
-- ('standard' | 'calendar' | 'integration'), a public `slug`, a `calendar`
-- JSONB config (which also holds the bookings array), and — for the single
-- reserved integration row — an `integrations` JSONB blob holding the global
-- Google refresh token + Stripe runtime state.
--
-- No new tables. Run AFTER 0004_admins_and_utm.sql on an existing DB, or just
-- use schema.sql on a fresh project. Idempotent.

alter table products add column if not exists kind text not null default 'standard'
  check (kind in ('standard','calendar','integration'));
alter table products add column if not exists slug text;
alter table products add column if not exists calendar jsonb;      -- CalendarConfig incl. bookings[]
alter table products add column if not exists integrations jsonb;  -- only on the singleton row

create unique index if not exists idx_products_slug on products (slug) where slug is not null;
create index if not exists idx_products_kind on products (kind);

-- ---------------------------------------------------------------------------
-- Atomic booking append.
--
-- Bookings live in calendar->'bookings'. Appending them in app code would be a
-- read-modify-write race under concurrency. This function does the overlap
-- check AND the append in one statement so two people can't grab the same slot.
-- Returns the inserted booking on success, or null if the slot is already taken
-- by a confirmed or still-live pending booking.
-- ---------------------------------------------------------------------------
create or replace function book_slot(
  p_product_id uuid,
  p_booking jsonb,
  p_now timestamptz
)
returns jsonb language plpgsql as $$
declare
  taken boolean;
begin
  -- Is the requested [start,end) already covered by a confirmed booking, or a
  -- pending booking whose hold hasn't expired?
  select exists (
    select 1
    from products,
         jsonb_array_elements(coalesce(calendar->'bookings','[]'::jsonb)) b
    where products.id = p_product_id
      and (b->>'status') in ('confirmed','pending')
      and not (
        (b->>'status') = 'pending'
        and (b->>'hold_expires_at') is not null
        and (b->>'hold_expires_at')::timestamptz < p_now
      )
      and tstzrange((b->>'start')::timestamptz, (b->>'end')::timestamptz)
          && tstzrange((p_booking->>'start')::timestamptz, (p_booking->>'end')::timestamptz)
  )
  into taken;

  if taken then
    return null;
  end if;

  update products
     set calendar = jsonb_set(
           calendar,
           '{bookings}',
           coalesce(calendar->'bookings','[]'::jsonb) || p_booking
         )
   where id = p_product_id;

  return p_booking;
end;
$$;

-- ---------------------------------------------------------------------------
-- Update a single booking inside the array by id (confirm / cancel / attach
-- the Google event id). Merges the patch object into the matching element.
-- ---------------------------------------------------------------------------
create or replace function update_booking(
  p_product_id uuid,
  p_booking_id text,
  p_patch jsonb
)
returns void language plpgsql as $$
begin
  update products
     set calendar = jsonb_set(
       calendar,
       '{bookings}',
       (
         select jsonb_agg(
           case when b->>'id' = p_booking_id then b || p_patch else b end
         )
         from jsonb_array_elements(coalesce(calendar->'bookings','[]'::jsonb)) b
       )
     )
   where id = p_product_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- The single reserved integration row. Fixed id so the app can always find it.
-- Hidden + kind='integration' keep it out of every product list.
-- ---------------------------------------------------------------------------
insert into products (id, name, kind, hidden, price, currency, integrations)
values (
  '00000000-0000-0000-0000-0000000000ff',
  '__integrations__',
  'integration',
  true,
  0,
  'USD',
  '{"google":{"connected":false,"refresh_token":null,"calendar_id":"primary","connected_email":null,"connected_at":null},"stripe":{"account_label":null}}'::jsonb
)
on conflict (id) do nothing;
