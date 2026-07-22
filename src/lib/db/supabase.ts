import "server-only";

import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  CustomerWithTags,
  EnrollmentFilter,
  TagHistoryFilter,
} from "@/lib/db/shared";
import type { CalendarInput } from "@/lib/db/memory";
import type {
  Activity,
  ActivityType,
  Admin,
  AdminSafe,
  Attachment,
  Automation,
  AutomationEnrollment,
  AutomationStep,
  AutomationStepRun,
  AutomationTrigger,
  AuditLog,
  Booking,
  Calendar,
  CrmForm,
  Customer,
  CustomerStatus,
  Deal,
  EmailRecord,
  FormFieldDef,
  FormMapping,
  FormSubmission,
  IntegrationSettings,
  Note,
  PipelineStage,
  Product,
  Purchase,
  Tag,
  TagHistory,
  UtmParams,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Supabase repository backend (v2 relational schema). Mirrors memory.ts
// function-for-function against the tables in supabase/schema.sql. Uses the
// service-role admin client (bypasses RLS — every screen is server-rendered).
// ---------------------------------------------------------------------------

type DB = ReturnType<typeof createAdminClient>;
function sb(): DB {
  return createAdminClient();
}
function row<T>(data: unknown): T {
  return data as T;
}
function stripHash(a: Admin): AdminSafe {
  const { password_hash: _h, ...safe } = a;
  void _h;
  return safe;
}

// ---- Admins ---------------------------------------------------------------

export async function listAdmins(): Promise<AdminSafe[]> {
  const db = sb();
  const { data, error } = await db.from("admins").select("*").is("archived_at", null).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((d) => stripHash(row<Admin>(d)));
}

export async function getAdmin(id: string): Promise<AdminSafe | null> {
  const db = sb();
  const { data, error } = await db.from("admins").select("*").eq("id", id).is("archived_at", null).maybeSingle();
  if (error) throw error;
  return data ? stripHash(row<Admin>(data)) : null;
}

export async function getAdminByEmailWithHash(email: string): Promise<Admin | null> {
  const db = sb();
  const { data, error } = await db.from("admins").select("*").ilike("email", email.trim()).is("archived_at", null).limit(1).maybeSingle();
  if (error) throw error;
  return data ? row<Admin>(data) : null;
}

export async function createAdmin(input: {
  email: string; name: string; password_hash: string; role?: Admin["role"];
}): Promise<AdminSafe> {
  const db = sb();
  const { data, error } = await db.from("admins").insert({
    email: input.email.trim().toLowerCase(), name: input.name.trim(),
    password_hash: input.password_hash, role: input.role ?? "admin",
  }).select("*").single();
  if (error) throw error;
  return stripHash(row<Admin>(data));
}

export async function updateAdmin(
  id: string,
  patch: Partial<Pick<Admin, "name" | "email" | "role" | "password_hash">>,
): Promise<AdminSafe | null> {
  const db = sb();
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.email !== undefined) update.email = patch.email.trim().toLowerCase();
  if (patch.role !== undefined) update.role = patch.role;
  if (patch.password_hash !== undefined) update.password_hash = patch.password_hash;
  const { data, error } = await db.from("admins").update(update).eq("id", id).select("*").maybeSingle();
  if (error) throw error;
  return data ? stripHash(row<Admin>(data)) : null;
}

export async function archiveAdmin(id: string): Promise<void> {
  const { error } = await sb().from("admins").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function setAdminLastLogin(id: string): Promise<void> {
  const { error } = await sb().from("admins").update({ last_login_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function liveAdminCount(): Promise<number> {
  const { count, error } = await sb().from("admins").select("*", { count: "exact", head: true }).is("archived_at", null);
  if (error) throw error;
  return count ?? 0;
}

// ---- Tags helpers (membership derived from customer_tags) ------------------

async function tagsForCustomerMap(customerIds: string[]): Promise<Map<string, Tag[]>> {
  const db = sb();
  const out = new Map<string, Tag[]>();
  if (customerIds.length === 0) return out;
  const { data: cts, error } = await db.from("customer_tags").select("customer_id, tag_id").in("customer_id", customerIds);
  if (error) throw error;
  const tagIds = [...new Set((cts ?? []).map((r) => r.tag_id as string))];
  if (tagIds.length === 0) return out;
  const { data: tags } = await db.from("tags").select("*").in("id", tagIds).is("archived_at", null);
  const byId = new Map((tags ?? []).map((t) => [t.id as string, row<Tag>(t)]));
  for (const ct of cts ?? []) {
    const tag = byId.get(ct.tag_id as string);
    if (!tag) continue;
    const list = out.get(ct.customer_id as string) ?? [];
    list.push(tag);
    out.set(ct.customer_id as string, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

// ---- Customers ------------------------------------------------------------

export async function listCustomers(): Promise<CustomerWithTags[]> {
  const db = sb();
  const { data, error } = await db.from("customers").select("*").is("archived_at", null).is("merged_into", null).order("created_at", { ascending: false });
  if (error) throw error;
  const customers = (data ?? []).map((c) => row<Customer>(c));
  const map = await tagsForCustomerMap(customers.map((c) => c.id));
  return customers.map((c) => ({ ...c, tags: map.get(c.id) ?? [] }));
}

export async function getCustomer(id: string): Promise<CustomerWithTags | null> {
  const db = sb();
  const { data, error } = await db.from("customers").select("*").eq("id", id).is("archived_at", null).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const map = await tagsForCustomerMap([id]);
  return { ...row<Customer>(data), tags: map.get(id) ?? [] };
}

export async function createCustomer(input: {
  name: string; email?: string | null; phone?: string | null; company?: string | null;
  notes?: string | null; status?: CustomerStatus; lead_source?: string | null;
  owner_id?: string | null; created_by?: string | null;
}): Promise<Customer> {
  const db = sb();
  const { data, error } = await db.from("customers").insert({
    name: input.name.trim(),
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    company: input.company?.trim() || null,
    notes: input.notes?.trim() || null,
    status: input.status ?? "lead",
    lead_source: input.lead_source ?? null,
    owner_id: input.owner_id ?? null,
    created_by: input.created_by ?? null,
  }).select("*").single();
  if (error) throw error;
  return row<Customer>(data);
}

export async function updateCustomer(
  id: string,
  patch: Partial<Pick<Customer, "name" | "email" | "phone" | "company" | "notes" | "status" | "lead_source" | "owner_id" | "last_contacted_at" | "merged_into" | "duplicate_of">>,
): Promise<Customer | null> {
  const db = sb();
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.email !== undefined) update.email = patch.email?.trim() || null;
  if (patch.phone !== undefined) update.phone = patch.phone?.trim() || null;
  if (patch.company !== undefined) update.company = patch.company?.trim() || null;
  if (patch.notes !== undefined) update.notes = patch.notes?.trim() || null;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.lead_source !== undefined) update.lead_source = patch.lead_source;
  if (patch.owner_id !== undefined) update.owner_id = patch.owner_id;
  if (patch.last_contacted_at !== undefined) update.last_contacted_at = patch.last_contacted_at;
  if (patch.merged_into !== undefined) update.merged_into = patch.merged_into;
  if (patch.duplicate_of !== undefined) update.duplicate_of = patch.duplicate_of;
  const { data, error } = await db.from("customers").update(update).eq("id", id).select("*").maybeSingle();
  if (error) throw error;
  return data ? row<Customer>(data) : null;
}

export async function archiveCustomer(id: string): Promise<void> {
  const { error } = await sb().from("customers").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function upsertCustomerByEmail(input: {
  name: string; email?: string | null; notes?: string | null; lead_source?: string | null;
}): Promise<{ customer: Customer; created: boolean }> {
  const db = sb();
  const email = input.email?.trim();
  if (email) {
    const { data: existing, error } = await db.from("customers").select("*").is("archived_at", null).is("merged_into", null).ilike("email", email).limit(1).maybeSingle();
    if (error) throw error;
    if (existing) {
      const cust = row<Customer>(existing);
      if (input.notes && !cust.notes) {
        await db.from("customers").update({ notes: input.notes }).eq("id", cust.id);
        cust.notes = input.notes;
      }
      return { customer: cust, created: false };
    }
  }
  return { customer: await createCustomer(input), created: true };
}

export async function setCustomerUtm(id: string, utm: UtmParams): Promise<Customer | null> {
  const db = sb();
  const { data: existing, error: readErr } = await db.from("customers").select("utm_first_touch, utm_latest_touch").eq("id", id).maybeSingle();
  if (readErr) throw readErr;
  if (!existing) return null;
  const first = { ...((existing.utm_first_touch ?? {}) as UtmParams) };
  const latest = { ...((existing.utm_latest_touch ?? {}) as UtmParams) };
  for (const [k, v] of Object.entries(utm)) {
    if (!v) continue;
    if (!first[k as keyof UtmParams]) first[k as keyof UtmParams] = v;
    latest[k as keyof UtmParams] = v;
  }
  const { data, error } = await db.from("customers").update({ utm_first_touch: first, utm_latest_touch: latest }).eq("id", id).select("*").maybeSingle();
  if (error) throw error;
  return data ? row<Customer>(data) : null;
}

// ---- Tags -----------------------------------------------------------------

export async function listTags(): Promise<Tag[]> {
  const db = sb();
  const { data, error } = await db.from("tags").select("*").is("archived_at", null).order("name");
  if (error) throw error;
  return (data ?? []).map((d) => row<Tag>(d));
}

export async function tagsForCustomer(customerId: string): Promise<Tag[]> {
  return (await tagsForCustomerMap([customerId])).get(customerId) ?? [];
}

export async function createTag(name: string, color: string): Promise<Tag> {
  const db = sb();
  const { data, error } = await db.from("tags").insert({ name: name.trim(), color }).select("*").single();
  if (error) throw error;
  return row<Tag>(data);
}

export async function updateTag(id: string, patch: Partial<Pick<Tag, "name" | "color">>): Promise<Tag | null> {
  const db = sb();
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.color !== undefined) update.color = patch.color;
  const { data, error } = await db.from("tags").update(update).eq("id", id).select("*").maybeSingle();
  if (error) throw error;
  return data ? row<Tag>(data) : null;
}

export async function archiveTag(id: string): Promise<void> {
  const db = sb();
  const { error } = await db.from("tags").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  await db.from("customer_tags").delete().eq("tag_id", id);
}

async function logTagHistory(action: "added" | "removed", tagId: string, customerIds: string[]): Promise<void> {
  if (customerIds.length === 0) return;
  const db = sb();
  const { data: tag } = await db.from("tags").select("name").eq("id", tagId).maybeSingle();
  const { data: custs } = await db.from("customers").select("id, name").in("id", customerIds);
  const nameById = new Map((custs ?? []).map((c) => [c.id as string, c.name as string]));
  const rows = customerIds.map((cid) => ({
    tag_id: tagId, customer_id: cid, action,
    tag_name: tag?.name ?? "", customer_name: nameById.get(cid) ?? "",
  }));
  await db.from("tag_history").insert(rows);
}

export async function setCustomerTag(customerId: string, tagId: string, on: boolean): Promise<void> {
  const db = sb();
  const { data: existing } = await db.from("customer_tags").select("tag_id").eq("customer_id", customerId).eq("tag_id", tagId).maybeSingle();
  if (on && !existing) {
    await db.from("customer_tags").insert({ customer_id: customerId, tag_id: tagId });
    await logTagHistory("added", tagId, [customerId]);
  } else if (!on && existing) {
    await db.from("customer_tags").delete().eq("customer_id", customerId).eq("tag_id", tagId);
    await logTagHistory("removed", tagId, [customerId]);
  }
}

export async function setCustomerTags(customerId: string, tagIds: string[]): Promise<void> {
  const db = sb();
  const { data: liveTags } = await db.from("tags").select("id").is("archived_at", null);
  const live = new Set((liveTags ?? []).map((t) => t.id as string));
  const after = new Set(tagIds.filter((t) => live.has(t)));
  const { data: current } = await db.from("customer_tags").select("tag_id").eq("customer_id", customerId);
  const before = new Set((current ?? []).map((r) => r.tag_id as string));
  for (const tagId of after) if (!before.has(tagId)) await setCustomerTag(customerId, tagId, true);
  for (const tagId of before) if (!after.has(tagId)) await setCustomerTag(customerId, tagId, false);
}

export async function applyTags(customerId: string, tagIds: string[]): Promise<void> {
  for (const id of tagIds) await setCustomerTag(customerId, id, true);
}

export async function addTagToCustomers(tagId: string, customerIds: string[]): Promise<void> {
  const db = sb();
  const { data: current } = await db.from("customer_tags").select("customer_id").eq("tag_id", tagId).in("customer_id", customerIds);
  const has = new Set((current ?? []).map((r) => r.customer_id as string));
  const fresh = customerIds.filter((cid) => !has.has(cid));
  if (fresh.length === 0) return;
  await db.from("customer_tags").insert(fresh.map((cid) => ({ customer_id: cid, tag_id: tagId })));
  await logTagHistory("added", tagId, fresh);
}

export async function tagUsageCounts(): Promise<Record<string, number>> {
  const db = sb();
  const [{ data: cts }, { data: liveCustomers }] = await Promise.all([
    db.from("customer_tags").select("tag_id, customer_id"),
    db.from("customers").select("id").is("archived_at", null).is("merged_into", null),
  ]);
  const live = new Set((liveCustomers ?? []).map((c) => c.id as string));
  const counts: Record<string, number> = {};
  for (const ct of cts ?? []) {
    if (!live.has(ct.customer_id as string)) continue;
    counts[ct.tag_id as string] = (counts[ct.tag_id as string] ?? 0) + 1;
  }
  return counts;
}

export async function listTagHistory(filter: TagHistoryFilter = {}): Promise<TagHistory[]> {
  const db = sb();
  let q = db.from("tag_history").select("*").order("created_at", { ascending: false });
  if (filter.tagId) q = q.eq("tag_id", filter.tagId);
  if (filter.customerId) q = q.eq("customer_id", filter.customerId);
  if (filter.action) q = q.eq("action", filter.action);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((d) => row<TagHistory>(d));
}

// ---- Products -------------------------------------------------------------

export async function listProducts(includeHidden = true): Promise<Product[]> {
  const db = sb();
  let q = db.from("products").select("*").is("archived_at", null);
  if (!includeHidden) q = q.eq("hidden", false);
  const { data, error } = await q.order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((d) => row<Product>(d));
}

export async function getProduct(id: string): Promise<Product | null> {
  const db = sb();
  const { data, error } = await db.from("products").select("*").eq("id", id).is("archived_at", null).maybeSingle();
  if (error) throw error;
  return data ? row<Product>(data) : null;
}

export async function createProduct(input: {
  name: string; description?: string | null; price: number; currency?: string; billing_type?: Product["billing_type"];
}): Promise<Product> {
  const db = sb();
  const { data, error } = await db.from("products").insert({
    name: input.name.trim(), description: input.description?.trim() || null,
    price: input.price, currency: input.currency || "USD", billing_type: input.billing_type || "one_time",
  }).select("*").single();
  if (error) throw error;
  return row<Product>(data);
}

export async function updateProduct(
  id: string,
  patch: Partial<Pick<Product, "name" | "description" | "price" | "currency" | "billing_type">>,
): Promise<Product | null> {
  const db = sb();
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.description !== undefined) update.description = patch.description?.trim() || null;
  if (patch.price !== undefined) update.price = patch.price;
  if (patch.currency !== undefined) update.currency = patch.currency;
  if (patch.billing_type !== undefined) update.billing_type = patch.billing_type;
  const { data, error } = await db.from("products").update(update).eq("id", id).select("*").maybeSingle();
  if (error) throw error;
  return data ? row<Product>(data) : null;
}

export async function archiveProduct(id: string): Promise<void> {
  const { error } = await sb().from("products").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

// ---- Calendars + Bookings --------------------------------------------------

async function uniqueCalendarSlug(name: string): Promise<string> {
  const db = sb();
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "calendar";
  let slug = base;
  let i = 1;
  for (;;) {
    const { data } = await db.from("calendars").select("id").eq("slug", slug).maybeSingle();
    if (!data) return slug;
    slug = `${base}-${++i}`;
  }
}

export async function listCalendars(): Promise<Calendar[]> {
  const db = sb();
  const { data, error } = await db.from("calendars").select("*").is("archived_at", null).order("name");
  if (error) throw error;
  return (data ?? []).map((d) => row<Calendar>(d));
}

export async function getCalendar(id: string): Promise<Calendar | null> {
  const db = sb();
  const { data, error } = await db.from("calendars").select("*").eq("id", id).is("archived_at", null).maybeSingle();
  if (error) throw error;
  return data ? row<Calendar>(data) : null;
}

export async function getCalendarBySlug(slug: string): Promise<Calendar | null> {
  const db = sb();
  const { data, error } = await db.from("calendars").select("*").eq("slug", slug).is("archived_at", null).maybeSingle();
  if (error) throw error;
  return data ? row<Calendar>(data) : null;
}

export async function createCalendar(input: CalendarInput): Promise<Calendar> {
  const db = sb();
  const slug = await uniqueCalendarSlug(input.name);
  const { data, error } = await db.from("calendars").insert({
    name: input.name.trim(), slug, description: input.description?.trim() || null,
    price: input.price, currency: input.currency || "USD", paid: input.paid,
    slot_minutes: input.slot_minutes, utc_offset_minutes: input.utc_offset_minutes,
    timezone_label: input.timezone_label, lead_time_minutes: input.lead_time_minutes,
    window_days: input.window_days, weekly_hours: input.weekly_hours, busyness: input.busyness,
  }).select("*").single();
  if (error) throw error;
  return row<Calendar>(data);
}

export async function updateCalendar(id: string, patch: Partial<CalendarInput>): Promise<Calendar | null> {
  const db = sb();
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.description !== undefined) update.description = patch.description?.trim() || null;
  if (patch.price !== undefined) update.price = patch.price;
  if (patch.currency !== undefined) update.currency = patch.currency;
  if (patch.paid !== undefined) update.paid = patch.paid;
  if (patch.slot_minutes !== undefined) update.slot_minutes = patch.slot_minutes;
  if (patch.utc_offset_minutes !== undefined) update.utc_offset_minutes = patch.utc_offset_minutes;
  if (patch.timezone_label !== undefined) update.timezone_label = patch.timezone_label;
  if (patch.lead_time_minutes !== undefined) update.lead_time_minutes = patch.lead_time_minutes;
  if (patch.window_days !== undefined) update.window_days = patch.window_days;
  if (patch.weekly_hours !== undefined) update.weekly_hours = patch.weekly_hours;
  if (patch.busyness !== undefined) update.busyness = patch.busyness;
  const { data, error } = await db.from("calendars").update(update).eq("id", id).select("*").maybeSingle();
  if (error) throw error;
  return data ? row<Calendar>(data) : null;
}

export async function archiveCalendar(id: string): Promise<void> {
  const { error } = await sb().from("calendars").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function listBookings(calendarId: string): Promise<Booking[]> {
  const db = sb();
  const { data, error } = await db.from("bookings").select("*").eq("calendar_id", calendarId).order("starts_at");
  if (error) throw error;
  return (data ?? []).map((d) => row<Booking>(d));
}

export async function getBooking(id: string): Promise<Booking | null> {
  const db = sb();
  const { data, error } = await db.from("bookings").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? row<Booking>(data) : null;
}

/**
 * Insert a booking. The DB exclusion constraint (excl_bookings_no_overlap)
 * guarantees no two non-canceled bookings on the same calendar overlap — a
 * conflicting insert raises a 23P01 exclusion_violation, which we translate to
 * "slot taken" (null) so callers don't need to know the constraint name.
 */
export async function bookSlot(input: {
  calendar_id: string; customer_id: string | null; status: Booking["status"];
  starts_at: string; ends_at: string; attendee_name: string; attendee_email: string;
  notes?: string | null; hold_expires_at?: string | null; amount?: number | null; currency?: string | null;
}): Promise<Booking | null> {
  const db = sb();
  const { data, error } = await db.from("bookings").insert({
    calendar_id: input.calendar_id, customer_id: input.customer_id, status: input.status,
    starts_at: input.starts_at, ends_at: input.ends_at,
    attendee_name: input.attendee_name, attendee_email: input.attendee_email,
    notes: input.notes ?? null, hold_expires_at: input.hold_expires_at ?? null,
    amount: input.amount ?? null, currency: input.currency ?? null,
  }).select("*").maybeSingle();
  if (error) {
    // 23P01 = exclusion_violation (overlapping booking). Treat as "slot taken".
    if ((error as { code?: string }).code === "23P01") return null;
    throw error;
  }
  return data ? row<Booking>(data) : null;
}

export async function updateBooking(
  bookingId: string,
  patch: Partial<Pick<Booking, "status" | "customer_id" | "google_event_id" | "stripe_session_id" | "hold_expires_at">>,
): Promise<Booking | null> {
  const db = sb();
  const { data, error } = await db.from("bookings").update(patch).eq("id", bookingId).select("*").maybeSingle();
  if (error) throw error;
  return data ? row<Booking>(data) : null;
}

export async function findBookingByStripeSession(sessionId: string): Promise<{ calendar: Calendar; booking: Booking } | null> {
  const db = sb();
  const { data, error } = await db.from("bookings").select("*").eq("stripe_session_id", sessionId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const booking = row<Booking>(data);
  const calendar = await getCalendar(booking.calendar_id);
  if (!calendar) return null;
  return { calendar, booking };
}

// ---- Integration settings (per-provider rows) ------------------------------

function defaultIntegrationSettings(): IntegrationSettings {
  return {
    google: { connected: false, refresh_token: null, calendar_id: "primary", connected_email: null, connected_at: null },
    stripe: { account_label: null },
  };
}

export async function getIntegrationSettings(): Promise<IntegrationSettings> {
  const db = sb();
  const { data, error } = await db.from("integration_settings").select("*");
  if (error) throw error;
  const out = defaultIntegrationSettings();
  for (const r of data ?? []) {
    const cfg = (r.config ?? {}) as Record<string, unknown>;
    if (r.provider === "google") {
      out.google = {
        connected: !!r.connected,
        refresh_token: (cfg.refresh_token as string) ?? null,
        calendar_id: (cfg.calendar_id as string) ?? "primary",
        connected_email: (cfg.connected_email as string) ?? null,
        connected_at: r.connected_at ?? null,
      };
    } else if (r.provider === "stripe") {
      out.stripe = { account_label: (cfg.account_label as string) ?? null };
    }
  }
  return out;
}

export async function updateIntegrationSettings(patch: {
  google?: Partial<IntegrationSettings["google"]>;
  stripe?: Partial<IntegrationSettings["stripe"]>;
}): Promise<IntegrationSettings> {
  const db = sb();
  if (patch.google) {
    const cur = await getIntegrationSettings();
    const g = { ...cur.google, ...patch.google };
    await db.from("integration_settings").upsert({
      provider: "google", connected: g.connected, connected_at: g.connected_at,
      config: { refresh_token: g.refresh_token, calendar_id: g.calendar_id, connected_email: g.connected_email },
    }, { onConflict: "provider" });
  }
  if (patch.stripe) {
    const cur = await getIntegrationSettings();
    const st = { ...cur.stripe, ...patch.stripe };
    await db.from("integration_settings").upsert(
      { provider: "stripe", config: { account_label: st.account_label } },
      { onConflict: "provider" },
    );
  }
  return getIntegrationSettings();
}

// ---- Purchases ------------------------------------------------------------

export async function listPurchases(): Promise<Purchase[]> {
  const db = sb();
  const { data, error } = await db.from("purchases").select("*").is("archived_at", null).order("purchased_at", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((d) => row<Purchase>(d));
}

export async function listPurchasesForCustomer(customerId: string): Promise<Purchase[]> {
  const db = sb();
  const { data, error } = await db.from("purchases").select("*").is("archived_at", null).eq("customer_id", customerId).order("purchased_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((d) => row<Purchase>(d));
}

export async function listPurchasesForProduct(productId: string): Promise<Purchase[]> {
  const db = sb();
  const { data, error } = await db.from("purchases").select("*").is("archived_at", null).eq("product_id", productId).order("purchased_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((d) => row<Purchase>(d));
}

export async function recordPurchase(input: {
  customer_id: string; product_id: string; purchased_at?: string; status?: Purchase["status"]; unit_amount?: number;
}): Promise<Purchase | null> {
  const db = sb();
  const { data: c } = await db.from("customers").select("id, name").eq("id", input.customer_id).maybeSingle();
  const { data: p } = await db.from("products").select("id, name, price, currency, billing_type").eq("id", input.product_id).maybeSingle();
  if (!c || !p) return null;
  const insert: Record<string, unknown> = {
    customer_id: c.id, customer_name: c.name, product_id: p.id, product_name: p.name,
    unit_amount: input.unit_amount ?? p.price, currency: p.currency, status: input.status ?? "paid",
    billing_type: p.billing_type, sub_status: p.billing_type === "subscription" ? "active" : "none",
  };
  if (input.purchased_at) insert.purchased_at = input.purchased_at;
  const { data, error } = await db.from("purchases").insert(insert).select("*").single();
  if (error) throw error;
  return row<Purchase>(data);
}

export async function archivePurchase(id: string): Promise<void> {
  const { error } = await sb().from("purchases").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function currentProductsFor(customerId: string): Promise<string[]> {
  const names = new Set<string>();
  for (const p of await listPurchasesForCustomer(customerId)) if (p.status === "paid") names.add(p.product_name);
  return [...names];
}

// ---- Forms ----------------------------------------------------------------

export async function listForms(): Promise<CrmForm[]> {
  const db = sb();
  const { data, error } = await db.from("forms").select("*").is("archived_at", null).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((d) => row<CrmForm>(d));
}

export async function getForm(id: string): Promise<CrmForm | null> {
  const db = sb();
  const { data, error } = await db.from("forms").select("*").eq("id", id).is("archived_at", null).maybeSingle();
  if (error) throw error;
  return data ? row<CrmForm>(data) : null;
}

export async function getFormByToken(token: string): Promise<CrmForm | null> {
  const db = sb();
  const { data, error } = await db.from("forms").select("*").eq("token", token).eq("active", true).is("archived_at", null).maybeSingle();
  if (error) throw error;
  return data ? row<CrmForm>(data) : null;
}

export async function getFormBySlug(slug: string): Promise<CrmForm | null> {
  const db = sb();
  const { data, error } = await db.from("forms").select("*").eq("slug", slug).eq("active", true).is("archived_at", null).maybeSingle();
  if (error) throw error;
  return data ? row<CrmForm>(data) : null;
}

async function uniqueFormSlug(name: string): Promise<string> {
  const db = sb();
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "form";
  let slug = base;
  let i = 1;
  for (;;) {
    const { data } = await db.from("forms").select("id").eq("slug", slug).maybeSingle();
    if (!data) return slug;
    slug = `${base}-${++i}`;
  }
}

export async function createForm(input: {
  name: string; fields: FormFieldDef[]; mapping: FormMapping; create_customer?: boolean;
}): Promise<CrmForm> {
  const db = sb();
  const slug = await uniqueFormSlug(input.name);
  const { data, error } = await db.from("forms").insert({
    name: input.name.trim(), slug, fields: input.fields, mapping: input.mapping,
    create_customer: input.create_customer ?? true,
  }).select("*").single();
  if (error) throw error;
  return row<CrmForm>(data);
}

export async function updateForm(
  id: string,
  patch: Partial<Pick<CrmForm, "name" | "fields" | "mapping" | "active" | "create_customer">>,
): Promise<CrmForm | null> {
  const db = sb();
  const update: Record<string, unknown> = { ...patch };
  if (patch.name !== undefined) update.name = patch.name.trim();
  const { data, error } = await db.from("forms").update(update).eq("id", id).select("*").maybeSingle();
  if (error) throw error;
  return data ? row<CrmForm>(data) : null;
}

export async function archiveForm(id: string): Promise<void> {
  const { error } = await sb().from("forms").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

// ---- Submissions ----------------------------------------------------------

export async function listSubmissions(formId?: string): Promise<FormSubmission[]> {
  const db = sb();
  let q = db.from("form_submissions").select("*");
  if (formId) q = q.eq("form_id", formId);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((d) => row<FormSubmission>(d));
}

export async function recordSubmission(input: {
  form_id: string; payload: Record<string, unknown>; mapped: Record<string, unknown>;
  customer_id: string | null; source_ip?: string | null; utm?: UtmParams; status?: string;
}): Promise<FormSubmission> {
  const db = sb();
  const { data, error } = await db.from("form_submissions").insert({
    form_id: input.form_id, payload: input.payload, mapped: input.mapped,
    customer_id: input.customer_id, source_ip: input.source_ip ?? null,
    utm: input.utm ?? {}, status: input.status ?? "received",
  }).select("*").single();
  if (error) throw error;
  return row<FormSubmission>(data);
}

// ---- Automations ----------------------------------------------------------

export async function listAutomations(): Promise<Automation[]> {
  const db = sb();
  const { data, error } = await db.from("automations").select("*").is("archived_at", null).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((d) => row<Automation>(d));
}

export async function getAutomation(id: string): Promise<Automation | null> {
  const db = sb();
  const { data, error } = await db.from("automations").select("*").eq("id", id).is("archived_at", null).maybeSingle();
  if (error) throw error;
  return data ? row<Automation>(data) : null;
}

export async function createAutomation(input: {
  name: string; description?: string | null; trigger: AutomationTrigger; steps: AutomationStep[]; active?: boolean;
}): Promise<Automation> {
  const db = sb();
  const { data, error } = await db.from("automations").insert({
    name: input.name.trim(), description: input.description?.trim() || null,
    trigger: input.trigger, steps: input.steps, active: input.active ?? true,
  }).select("*").single();
  if (error) throw error;
  return row<Automation>(data);
}

export async function updateAutomation(
  id: string,
  patch: Partial<Pick<Automation, "name" | "description" | "trigger" | "steps" | "active">>,
): Promise<Automation | null> {
  const db = sb();
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.description !== undefined) update.description = patch.description?.trim() || null;
  if (patch.trigger !== undefined) update.trigger = patch.trigger;
  if (patch.steps !== undefined) update.steps = patch.steps;
  if (patch.active !== undefined) update.active = patch.active;
  const { data, error } = await db.from("automations").update(update).eq("id", id).select("*").maybeSingle();
  if (error) throw error;
  return data ? row<Automation>(data) : null;
}

export async function archiveAutomation(id: string): Promise<void> {
  const { error } = await sb().from("automations").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function listEnrollments(filter: EnrollmentFilter = {}): Promise<AutomationEnrollment[]> {
  const db = sb();
  let q = db.from("automation_enrollments").select("*").order("created_at", { ascending: false });
  if (filter.automationId) q = q.eq("automation_id", filter.automationId);
  if (filter.customerId) q = q.eq("customer_id", filter.customerId);
  if (filter.status) q = q.eq("status", filter.status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((d) => row<AutomationEnrollment>(d));
}

export async function getEnrollment(id: string): Promise<AutomationEnrollment | null> {
  const db = sb();
  const { data, error } = await db.from("automation_enrollments").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? row<AutomationEnrollment>(data) : null;
}

export async function enrollContact(automationId: string, customerId: string): Promise<AutomationEnrollment | null> {
  const db = sb();
  const { data: automation } = await db.from("automations").select("id").eq("id", automationId).is("archived_at", null).maybeSingle();
  const { data: customer } = await db.from("customers").select("id, name, email, custom_fields").eq("id", customerId).maybeSingle();
  if (!automation || !customer) return null;
  const { data: existing } = await db.from("automation_enrollments").select("*").eq("automation_id", automationId).eq("customer_id", customerId).eq("status", "active").maybeSingle();
  if (existing) return row<AutomationEnrollment>(existing);
  const { data, error } = await db.from("automation_enrollments").insert({
    automation_id: automationId, customer_id: customerId,
    customer_name: customer.name, customer_email: customer.email, status: "active", current_step: 0,
    next_run_at: new Date().toISOString(),
    context: { name: customer.name, email: customer.email ?? "", custom: customer.custom_fields ?? {} },
  }).select("*").single();
  if (error) throw error;
  return row<AutomationEnrollment>(data);
}

export async function updateEnrollment(
  id: string,
  patch: Partial<Pick<AutomationEnrollment, "status" | "current_step" | "next_run_at" | "context">>,
): Promise<AutomationEnrollment | null> {
  const db = sb();
  const { data, error } = await db.from("automation_enrollments").update(patch).eq("id", id).select("*").maybeSingle();
  if (error) throw error;
  return data ? row<AutomationEnrollment>(data) : null;
}

export async function cancelEnrollment(id: string): Promise<void> {
  const { error } = await sb().from("automation_enrollments").update({ status: "canceled", next_run_at: null }).eq("id", id).eq("status", "active");
  if (error) throw error;
}

export async function claimDueEnrollments(nowISO: string, limit: number): Promise<AutomationEnrollment[]> {
  const db = sb();
  const { data, error } = await db.rpc("claim_due_enrollments", { p_now: nowISO, p_limit: limit });
  if (error) throw error;
  return (data ?? []).map((d: unknown) => row<AutomationEnrollment>(d));
}

export async function recordStepRun(input: {
  enrollment_id: string; step_index: number; step_type: AutomationStep["type"];
  detail: string; message_id?: string | null; error?: string | null;
}): Promise<AutomationStepRun> {
  const db = sb();
  const { data, error } = await db.from("automation_step_runs").insert({
    enrollment_id: input.enrollment_id, step_index: input.step_index, step_type: input.step_type,
    detail: input.detail, message_id: input.message_id ?? null, error: input.error ?? null,
  }).select("*").single();
  if (error) throw error;
  return row<AutomationStepRun>(data);
}

export async function listStepRuns(enrollmentId: string): Promise<AutomationStepRun[]> {
  const db = sb();
  const { data, error } = await db.from("automation_step_runs").select("*").eq("enrollment_id", enrollmentId).order("ran_at");
  if (error) throw error;
  return (data ?? []).map((d) => row<AutomationStepRun>(d));
}

// ---- Notes ----------------------------------------------------------------

export async function listNotes(customerId: string): Promise<Note[]> {
  const db = sb();
  const { data, error } = await db.from("notes").select("*").eq("customer_id", customerId).is("archived_at", null).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((d) => row<Note>(d));
}

export async function createNote(input: { customer_id: string; body: string; created_by?: string | null }): Promise<Note> {
  const db = sb();
  const { data, error } = await db.from("notes").insert({ customer_id: input.customer_id, body: input.body.trim(), created_by: input.created_by ?? null }).select("*").single();
  if (error) throw error;
  return row<Note>(data);
}

export async function archiveNote(id: string): Promise<void> {
  const { error } = await sb().from("notes").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

// ---- Activities ------------------------------------------------------------

export async function listActivities(customerId: string): Promise<Activity[]> {
  const db = sb();
  const { data, error } = await db.from("activities").select("*").eq("customer_id", customerId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((d) => row<Activity>(d));
}

export async function recordActivity(input: {
  customer_id: string; type: ActivityType; payload?: Record<string, unknown>; created_by?: string | null;
}): Promise<Activity> {
  const db = sb();
  const { data, error } = await db.from("activities").insert({
    customer_id: input.customer_id, type: input.type, payload: input.payload ?? {}, created_by: input.created_by ?? null,
  }).select("*").single();
  if (error) throw error;
  return row<Activity>(data);
}

// ---- Emails ---------------------------------------------------------------

export async function listEmails(customerId: string): Promise<EmailRecord[]> {
  const db = sb();
  const { data, error } = await db.from("emails").select("*").eq("customer_id", customerId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((d) => row<EmailRecord>(d));
}

export async function recordEmail(input: {
  customer_id: string | null; provider_id?: string | null; subject: string;
  body?: string | null; status?: EmailRecord["status"]; sent_at?: string | null;
}): Promise<EmailRecord> {
  const db = sb();
  const { data, error } = await db.from("emails").insert({
    customer_id: input.customer_id, provider_id: input.provider_id ?? null, subject: input.subject,
    body: input.body ?? null, status: input.status ?? "sent", sent_at: input.sent_at ?? new Date().toISOString(),
  }).select("*").single();
  if (error) throw error;
  return row<EmailRecord>(data);
}

// ---- Deals + pipeline ------------------------------------------------------

export async function listPipelineStages(): Promise<PipelineStage[]> {
  const db = sb();
  const { data, error } = await db.from("pipeline_stages").select("*").order("position");
  if (error) throw error;
  return (data ?? []).map((d) => row<PipelineStage>(d));
}

export async function listDeals(customerId?: string): Promise<Deal[]> {
  const db = sb();
  let q = db.from("deals").select("*").is("archived_at", null).order("created_at", { ascending: false });
  if (customerId) q = q.eq("customer_id", customerId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((d) => row<Deal>(d));
}

export async function createDeal(input: {
  customer_id: string; title: string; stage_id?: string | null; value?: number; currency?: string;
  probability?: number; expected_close_date?: string | null; owner_id?: string | null;
}): Promise<Deal> {
  const db = sb();
  const { data, error } = await db.from("deals").insert({
    customer_id: input.customer_id, title: input.title.trim(), stage_id: input.stage_id ?? null,
    value: input.value ?? 0, currency: input.currency ?? "USD", probability: input.probability ?? 0,
    expected_close_date: input.expected_close_date ?? null, owner_id: input.owner_id ?? null,
  }).select("*").single();
  if (error) throw error;
  return row<Deal>(data);
}

export async function updateDeal(
  id: string,
  patch: Partial<Pick<Deal, "title" | "stage_id" | "value" | "currency" | "probability" | "expected_close_date" | "owner_id" | "status" | "closed_at">>,
): Promise<Deal | null> {
  const db = sb();
  const update: Record<string, unknown> = { ...patch };
  if (patch.title !== undefined) update.title = patch.title.trim();
  const { data, error } = await db.from("deals").update(update).eq("id", id).select("*").maybeSingle();
  if (error) throw error;
  return data ? row<Deal>(data) : null;
}

export async function archiveDeal(id: string): Promise<void> {
  const { error } = await sb().from("deals").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

// ---- Attachments -----------------------------------------------------------

export async function listAttachments(customerId: string): Promise<Attachment[]> {
  const db = sb();
  const { data, error } = await db.from("attachments").select("*").eq("customer_id", customerId).order("uploaded_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((d) => row<Attachment>(d));
}

export async function createAttachment(input: {
  customer_id: string; filename: string; mime_type?: string | null; size?: number | null; url: string; uploaded_by?: string | null;
}): Promise<Attachment> {
  const db = sb();
  const { data, error } = await db.from("attachments").insert({
    customer_id: input.customer_id, filename: input.filename, mime_type: input.mime_type ?? null,
    size: input.size ?? null, url: input.url, uploaded_by: input.uploaded_by ?? null,
  }).select("*").single();
  if (error) throw error;
  return row<Attachment>(data);
}

export async function archiveAttachment(id: string): Promise<void> {
  const { error } = await sb().from("attachments").delete().eq("id", id);
  if (error) throw error;
}

// ---- Audit logs ------------------------------------------------------------

export async function listAuditLogs(limit = 200): Promise<AuditLog[]> {
  const db = sb();
  const { data, error } = await db.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).map((d) => row<AuditLog>(d));
}

export async function recordAuditLog(input: {
  actor_id?: string | null; action: string; entity_type?: string | null; entity_id?: string | null;
  before?: Record<string, unknown> | null; after?: Record<string, unknown> | null; ip?: string | null;
}): Promise<AuditLog> {
  const db = sb();
  const { data, error } = await db.from("audit_logs").insert({
    actor_id: input.actor_id ?? null, action: input.action, entity_type: input.entity_type ?? null,
    entity_id: input.entity_id ?? null, before: input.before ?? null, after: input.after ?? null, ip: input.ip ?? null,
  }).select("*").single();
  if (error) throw error;
  return row<AuditLog>(data);
}
