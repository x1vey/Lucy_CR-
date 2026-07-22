import "server-only";

import { randomUUID } from "crypto";
import { currentDate, db, now } from "@/lib/db/store";
import type {
  CustomerWithTags,
  EnrollmentFilter,
  TagHistoryFilter,
} from "@/lib/db/shared";
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
  IntegrationProvider,
  IntegrationSettings,
  Note,
  PipelineStage,
  Product,
  Purchase,
  Tag,
  TagHistory,
  UtmParams,
  WeeklyHours,
  Busyness,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// In-memory repository backend (v2 relational shape). Mirrors supabase.ts
// function-for-function. All state lives in src/lib/db/store.ts.
// ---------------------------------------------------------------------------

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function stripHash(a: Admin): AdminSafe {
  const { password_hash: _h, ...safe } = a;
  void _h;
  return clone(safe);
}

// ---- Admins ---------------------------------------------------------------

export async function listAdmins(): Promise<AdminSafe[]> {
  return db()
    .admins.filter((a) => !a.archived_at)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map(stripHash);
}

export async function getAdmin(id: string): Promise<AdminSafe | null> {
  const a = db().admins.find((x) => x.id === id && !x.archived_at);
  return a ? stripHash(a) : null;
}

export async function getAdminByEmailWithHash(email: string): Promise<Admin | null> {
  const e = email.trim().toLowerCase();
  const a = db().admins.find((x) => x.email.toLowerCase() === e && !x.archived_at);
  return a ? clone(a) : null;
}

export async function createAdmin(input: {
  email: string;
  name: string;
  password_hash: string;
  role?: Admin["role"];
}): Promise<AdminSafe> {
  const s = db();
  const ts = now();
  const a: Admin = {
    id: randomUUID(),
    email: input.email.trim().toLowerCase(),
    name: input.name.trim(),
    password_hash: input.password_hash,
    role: input.role ?? "admin",
    last_login_at: null,
    archived_at: null,
    created_at: ts,
    updated_at: ts,
  };
  s.admins.push(a);
  return stripHash(a);
}

export async function updateAdmin(
  id: string,
  patch: Partial<Pick<Admin, "name" | "email" | "role" | "password_hash">>,
): Promise<AdminSafe | null> {
  const s = db();
  const a = s.admins.find((x) => x.id === id);
  if (!a) return null;
  if (patch.name !== undefined) a.name = patch.name.trim();
  if (patch.email !== undefined) a.email = patch.email.trim().toLowerCase();
  if (patch.role !== undefined) a.role = patch.role;
  if (patch.password_hash !== undefined) a.password_hash = patch.password_hash;
  a.updated_at = now();
  return stripHash(a);
}

export async function archiveAdmin(id: string): Promise<void> {
  const a = db().admins.find((x) => x.id === id);
  if (a) a.archived_at = now();
}

export async function setAdminLastLogin(id: string): Promise<void> {
  const a = db().admins.find((x) => x.id === id);
  if (a) a.last_login_at = now();
}

export async function liveAdminCount(): Promise<number> {
  return db().admins.filter((a) => !a.archived_at).length;
}

// ---- Customers ------------------------------------------------------------

function tagsForCustomerSync(customerId: string): Tag[] {
  const s = db();
  const tagIds = new Set(
    s.customerTags.filter((ct) => ct.customer_id === customerId).map((ct) => ct.tag_id),
  );
  return s.tags
    .filter((t) => !t.archived_at && tagIds.has(t.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(clone);
}

export async function listCustomers(): Promise<CustomerWithTags[]> {
  return db()
    .customers.filter((c) => !c.archived_at && !c.merged_into)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map((c) => ({ ...clone(c), tags: tagsForCustomerSync(c.id) }));
}

export async function getCustomer(id: string): Promise<CustomerWithTags | null> {
  const c = db().customers.find((x) => x.id === id && !x.archived_at);
  if (!c) return null;
  return { ...clone(c), tags: tagsForCustomerSync(c.id) };
}

export async function createCustomer(input: {
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  notes?: string | null;
  status?: CustomerStatus;
  lead_source?: string | null;
  owner_id?: string | null;
  created_by?: string | null;
}): Promise<Customer> {
  const s = db();
  const ts = now();
  const c: Customer = {
    id: randomUUID(),
    name: input.name.trim(),
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    company: input.company?.trim() || null,
    status: input.status ?? "lead",
    lead_source: input.lead_source ?? null,
    owner_id: input.owner_id ?? null,
    created_by: input.created_by ?? null,
    notes: input.notes?.trim() || null,
    custom_fields: {},
    utm_first_touch: {},
    utm_latest_touch: {},
    last_contacted_at: null,
    merged_into: null,
    duplicate_of: null,
    hidden: false,
    archived_at: null,
    created_at: ts,
    updated_at: ts,
  };
  s.customers.unshift(c);
  return clone(c);
}

export async function updateCustomer(
  id: string,
  patch: Partial<
    Pick<
      Customer,
      | "name"
      | "email"
      | "phone"
      | "company"
      | "notes"
      | "status"
      | "lead_source"
      | "owner_id"
      | "last_contacted_at"
      | "merged_into"
      | "duplicate_of"
    >
  >,
): Promise<Customer | null> {
  const s = db();
  const c = s.customers.find((x) => x.id === id);
  if (!c) return null;
  if (patch.name !== undefined) c.name = patch.name.trim();
  if (patch.email !== undefined) c.email = patch.email?.trim() || null;
  if (patch.phone !== undefined) c.phone = patch.phone?.trim() || null;
  if (patch.company !== undefined) c.company = patch.company?.trim() || null;
  if (patch.notes !== undefined) c.notes = patch.notes?.trim() || null;
  if (patch.status !== undefined) c.status = patch.status;
  if (patch.lead_source !== undefined) c.lead_source = patch.lead_source;
  if (patch.owner_id !== undefined) c.owner_id = patch.owner_id;
  if (patch.last_contacted_at !== undefined) c.last_contacted_at = patch.last_contacted_at;
  if (patch.merged_into !== undefined) c.merged_into = patch.merged_into;
  if (patch.duplicate_of !== undefined) c.duplicate_of = patch.duplicate_of;
  c.updated_at = now();
  return clone(c);
}

export async function archiveCustomer(id: string): Promise<void> {
  const c = db().customers.find((x) => x.id === id);
  if (c) c.archived_at = now();
}

export async function upsertCustomerByEmail(input: {
  name: string;
  email?: string | null;
  notes?: string | null;
  lead_source?: string | null;
}): Promise<{ customer: Customer; created: boolean }> {
  const s = db();
  const email = input.email?.trim().toLowerCase();
  if (email) {
    const existing = s.customers.find(
      (c) => !c.archived_at && !c.merged_into && c.email?.toLowerCase() === email,
    );
    if (existing) {
      if (input.notes && !existing.notes) existing.notes = input.notes;
      existing.updated_at = now();
      return { customer: clone(existing), created: false };
    }
  }
  return { customer: await createCustomer(input), created: true };
}

// First-touch fills once (never overwritten); latest-touch always updates.
export async function setCustomerUtm(
  id: string,
  utm: UtmParams,
): Promise<Customer | null> {
  const s = db();
  const c = s.customers.find((x) => x.id === id);
  if (!c) return null;
  let changed = false;
  for (const [k, v] of Object.entries(utm)) {
    if (!v) continue;
    if (!c.utm_first_touch[k as keyof UtmParams]) {
      c.utm_first_touch[k as keyof UtmParams] = v;
      changed = true;
    }
    c.utm_latest_touch[k as keyof UtmParams] = v;
    changed = true;
  }
  if (changed) c.updated_at = now();
  return clone(c);
}

// ---- Tags (relational: catalogue + membership + history) -------------------

export async function listTags(): Promise<Tag[]> {
  return db()
    .tags.filter((t) => !t.archived_at)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(clone);
}

export async function tagsForCustomer(customerId: string): Promise<Tag[]> {
  return tagsForCustomerSync(customerId);
}

export async function createTag(name: string, color: string): Promise<Tag> {
  const s = db();
  const ts = now();
  const t: Tag = {
    id: randomUUID(),
    name: name.trim(),
    color,
    archived_at: null,
    created_at: ts,
    updated_at: ts,
  };
  s.tags.push(t);
  return clone(t);
}

export async function updateTag(
  id: string,
  patch: Partial<Pick<Tag, "name" | "color">>,
): Promise<Tag | null> {
  const s = db();
  const t = s.tags.find((x) => x.id === id);
  if (!t) return null;
  if (patch.name !== undefined) t.name = patch.name.trim();
  if (patch.color !== undefined) t.color = patch.color;
  t.updated_at = now();
  return clone(t);
}

export async function archiveTag(id: string): Promise<void> {
  const s = db();
  const t = s.tags.find((x) => x.id === id);
  if (t) t.archived_at = now();
  // Membership rows for an archived tag are dropped (it's no longer applied).
  s.customerTags = s.customerTags.filter((ct) => ct.tag_id !== id);
}

function logTagHistory(
  action: "added" | "removed",
  tagId: string,
  customerIds: string[],
): void {
  const s = db();
  const tag = s.tags.find((t) => t.id === tagId);
  for (const cid of customerIds) {
    const c = s.customers.find((x) => x.id === cid);
    s.tagHistory.push({
      id: randomUUID(),
      tag_id: tagId,
      customer_id: cid,
      action,
      tag_name: tag?.name ?? "",
      customer_name: c?.name ?? "",
      actor_id: null,
      created_at: now(),
    });
  }
}

function hasTag(customerId: string, tagId: string): boolean {
  return db().customerTags.some(
    (ct) => ct.customer_id === customerId && ct.tag_id === tagId,
  );
}

export async function setCustomerTag(
  customerId: string,
  tagId: string,
  on: boolean,
): Promise<void> {
  const s = db();
  const has = hasTag(customerId, tagId);
  if (on && !has) {
    s.customerTags.push({ customer_id: customerId, tag_id: tagId, assigned_by: null, assigned_at: now() });
    logTagHistory("added", tagId, [customerId]);
  } else if (!on && has) {
    s.customerTags = s.customerTags.filter(
      (ct) => !(ct.customer_id === customerId && ct.tag_id === tagId),
    );
    logTagHistory("removed", tagId, [customerId]);
  }
}

export async function setCustomerTags(customerId: string, tagIds: string[]): Promise<void> {
  const s = db();
  const liveTagIds = new Set(s.tags.filter((t) => !t.archived_at).map((t) => t.id));
  const after = new Set(tagIds.filter((t) => liveTagIds.has(t)));
  const before = new Set(
    s.customerTags.filter((ct) => ct.customer_id === customerId).map((ct) => ct.tag_id),
  );
  for (const tagId of after) if (!before.has(tagId)) await setCustomerTag(customerId, tagId, true);
  for (const tagId of before) if (!after.has(tagId)) await setCustomerTag(customerId, tagId, false);
}

export async function applyTags(customerId: string, tagIds: string[]): Promise<void> {
  for (const id of tagIds) await setCustomerTag(customerId, id, true);
}

// Apply ONE tag to MANY contacts (bulk). Skips contacts that already have it.
export async function addTagToCustomers(tagId: string, customerIds: string[]): Promise<void> {
  const s = db();
  const fresh = customerIds.filter((cid) => !hasTag(cid, tagId));
  for (const cid of fresh) {
    s.customerTags.push({ customer_id: cid, tag_id: tagId, assigned_by: null, assigned_at: now() });
  }
  logTagHistory("added", tagId, fresh);
}

export async function tagUsageCounts(): Promise<Record<string, number>> {
  const s = db();
  const liveCustomers = new Set(
    s.customers.filter((c) => !c.archived_at && !c.merged_into).map((c) => c.id),
  );
  const counts: Record<string, number> = {};
  for (const ct of s.customerTags) {
    if (!liveCustomers.has(ct.customer_id)) continue;
    counts[ct.tag_id] = (counts[ct.tag_id] ?? 0) + 1;
  }
  return counts;
}

export async function listTagHistory(filter: TagHistoryFilter = {}): Promise<TagHistory[]> {
  return db()
    .tagHistory.filter(
      (h) =>
        (!filter.tagId || h.tag_id === filter.tagId) &&
        (!filter.customerId || h.customer_id === filter.customerId) &&
        (!filter.action || h.action === filter.action),
    )
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map(clone);
}

// ---- Products -------------------------------------------------------------

export async function listProducts(includeHidden = true): Promise<Product[]> {
  return db()
    .products.filter((p) => !p.archived_at && (includeHidden || !p.hidden))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(clone);
}

export async function getProduct(id: string): Promise<Product | null> {
  const p = db().products.find((x) => x.id === id && !x.archived_at);
  return p ? clone(p) : null;
}

export async function createProduct(input: {
  name: string;
  description?: string | null;
  price: number;
  currency?: string;
  billing_type?: Product["billing_type"];
}): Promise<Product> {
  const s = db();
  const ts = now();
  const p: Product = {
    id: randomUUID(),
    name: input.name.trim(),
    description: input.description?.trim() || null,
    price: input.price,
    currency: input.currency || "USD",
    billing_type: input.billing_type || "one_time",
    hidden: false,
    archived_at: null,
    created_at: ts,
    updated_at: ts,
  };
  s.products.push(p);
  return clone(p);
}

export async function updateProduct(
  id: string,
  patch: Partial<Pick<Product, "name" | "description" | "price" | "currency" | "billing_type">>,
): Promise<Product | null> {
  const s = db();
  const p = s.products.find((x) => x.id === id);
  if (!p) return null;
  if (patch.name !== undefined) p.name = patch.name.trim();
  if (patch.description !== undefined) p.description = patch.description?.trim() || null;
  if (patch.price !== undefined) p.price = patch.price;
  if (patch.currency !== undefined) p.currency = patch.currency;
  if (patch.billing_type !== undefined) p.billing_type = patch.billing_type;
  p.updated_at = now();
  return clone(p);
}

export async function archiveProduct(id: string): Promise<void> {
  const p = db().products.find((x) => x.id === id);
  if (p) p.archived_at = now();
}

// ---- Calendars + Bookings (relational) -------------------------------------

function calSlugify(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  const s = db();
  let slug = base || "calendar";
  let i = 1;
  while (s.calendars.some((c) => c.slug === slug)) slug = `${base}-${++i}`;
  return slug;
}

export async function listCalendars(): Promise<Calendar[]> {
  return db()
    .calendars.filter((c) => !c.archived_at)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(clone);
}

export async function getCalendar(id: string): Promise<Calendar | null> {
  const c = db().calendars.find((x) => x.id === id && !x.archived_at);
  return c ? clone(c) : null;
}

export async function getCalendarBySlug(slug: string): Promise<Calendar | null> {
  const c = db().calendars.find((x) => x.slug === slug && !x.archived_at);
  return c ? clone(c) : null;
}

export interface CalendarInput {
  name: string;
  description?: string | null;
  price: number;
  currency?: string;
  paid: boolean;
  slot_minutes: number;
  utc_offset_minutes: number;
  timezone_label: string;
  lead_time_minutes: number;
  window_days: number;
  weekly_hours: WeeklyHours;
  busyness: Busyness;
}

export async function createCalendar(input: CalendarInput): Promise<Calendar> {
  const s = db();
  const ts = now();
  const c: Calendar = {
    id: randomUUID(),
    name: input.name.trim(),
    slug: calSlugify(input.name),
    description: input.description?.trim() || null,
    price: input.price,
    currency: input.currency || "USD",
    paid: input.paid,
    slot_minutes: input.slot_minutes,
    utc_offset_minutes: input.utc_offset_minutes,
    timezone_label: input.timezone_label,
    lead_time_minutes: input.lead_time_minutes,
    window_days: input.window_days,
    weekly_hours: input.weekly_hours,
    busyness: input.busyness,
    archived_at: null,
    created_at: ts,
    updated_at: ts,
  };
  s.calendars.push(c);
  return clone(c);
}

export async function updateCalendar(
  id: string,
  patch: Partial<CalendarInput>,
): Promise<Calendar | null> {
  const s = db();
  const c = s.calendars.find((x) => x.id === id);
  if (!c) return null;
  if (patch.name !== undefined) c.name = patch.name.trim();
  if (patch.description !== undefined) c.description = patch.description?.trim() || null;
  if (patch.price !== undefined) c.price = patch.price;
  if (patch.currency !== undefined) c.currency = patch.currency;
  if (patch.paid !== undefined) c.paid = patch.paid;
  if (patch.slot_minutes !== undefined) c.slot_minutes = patch.slot_minutes;
  if (patch.utc_offset_minutes !== undefined) c.utc_offset_minutes = patch.utc_offset_minutes;
  if (patch.timezone_label !== undefined) c.timezone_label = patch.timezone_label;
  if (patch.lead_time_minutes !== undefined) c.lead_time_minutes = patch.lead_time_minutes;
  if (patch.window_days !== undefined) c.window_days = patch.window_days;
  if (patch.weekly_hours !== undefined) c.weekly_hours = patch.weekly_hours;
  if (patch.busyness !== undefined) c.busyness = patch.busyness;
  c.updated_at = now();
  return clone(c);
}

export async function archiveCalendar(id: string): Promise<void> {
  const c = db().calendars.find((x) => x.id === id);
  if (c) c.archived_at = now();
}

export async function listBookings(calendarId: string): Promise<Booking[]> {
  return db()
    .bookings.filter((b) => b.calendar_id === calendarId)
    .sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1))
    .map(clone);
}

export async function getBooking(id: string): Promise<Booking | null> {
  const b = db().bookings.find((x) => x.id === id);
  return b ? clone(b) : null;
}

/**
 * Insert a booking IF its [starts_at,ends_at) doesn't overlap an existing
 * confirmed or live-pending booking on the same calendar. Returns the booking,
 * or null if the slot is taken. Race-free in memory mode (no await between the
 * check and the push). In Postgres this is enforced by an exclusion constraint.
 */
export async function bookSlot(input: {
  calendar_id: string;
  customer_id: string | null;
  status: Booking["status"];
  starts_at: string;
  ends_at: string;
  attendee_name: string;
  attendee_email: string;
  notes?: string | null;
  hold_expires_at?: string | null;
  amount?: number | null;
  currency?: string | null;
}): Promise<Booking | null> {
  const s = db();
  const nowMs = Date.now();
  const startMs = new Date(input.starts_at).getTime();
  const endMs = new Date(input.ends_at).getTime();
  const overlaps = s.bookings.some((b) => {
    if (b.calendar_id !== input.calendar_id) return false;
    if (b.status === "canceled") return false;
    if (b.status === "pending" && b.hold_expires_at && new Date(b.hold_expires_at).getTime() < nowMs) return false;
    return new Date(b.starts_at).getTime() < endMs && startMs < new Date(b.ends_at).getTime();
  });
  if (overlaps) return null;
  const ts = now();
  const booking: Booking = {
    id: randomUUID(),
    calendar_id: input.calendar_id,
    customer_id: input.customer_id,
    status: input.status,
    starts_at: input.starts_at,
    ends_at: input.ends_at,
    attendee_name: input.attendee_name,
    attendee_email: input.attendee_email,
    notes: input.notes ?? null,
    google_event_id: null,
    stripe_session_id: null,
    hold_expires_at: input.hold_expires_at ?? null,
    amount: input.amount ?? null,
    currency: input.currency ?? null,
    created_at: ts,
    updated_at: ts,
  };
  s.bookings.push(booking);
  return clone(booking);
}

export async function updateBooking(
  bookingId: string,
  patch: Partial<
    Pick<Booking, "status" | "customer_id" | "google_event_id" | "stripe_session_id" | "hold_expires_at">
  >,
): Promise<Booking | null> {
  const s = db();
  const b = s.bookings.find((x) => x.id === bookingId);
  if (!b) return null;
  Object.assign(b, patch);
  b.updated_at = now();
  return clone(b);
}

export async function findBookingByStripeSession(
  sessionId: string,
): Promise<{ calendar: Calendar; booking: Booking } | null> {
  const s = db();
  const booking = s.bookings.find((b) => b.stripe_session_id === sessionId);
  if (!booking) return null;
  const calendar = s.calendars.find((c) => c.id === booking.calendar_id);
  if (!calendar) return null;
  return { calendar: clone(calendar), booking: clone(booking) };
}

// ---- Integration settings (per-provider rows) ------------------------------

function defaultIntegrationSettings(): IntegrationSettings {
  return {
    google: { connected: false, refresh_token: null, calendar_id: "primary", connected_email: null, connected_at: null },
    stripe: { account_label: null },
  };
}

export async function getIntegrationSettings(): Promise<IntegrationSettings> {
  const s = db();
  const g = s.integrations.find((i) => i.provider === "google");
  const st = s.integrations.find((i) => i.provider === "stripe");
  const out = defaultIntegrationSettings();
  if (g) {
    out.google = {
      connected: g.connected,
      refresh_token: (g.config.refresh_token as string) ?? null,
      calendar_id: (g.config.calendar_id as string) ?? "primary",
      connected_email: (g.config.connected_email as string) ?? null,
      connected_at: g.connected_at,
    };
  }
  if (st) out.stripe = { account_label: (st.config.account_label as string) ?? null };
  return out;
}

export async function updateIntegrationSettings(patch: {
  google?: Partial<IntegrationSettings["google"]>;
  stripe?: Partial<IntegrationSettings["stripe"]>;
}): Promise<IntegrationSettings> {
  const s = db();
  const ensure = (provider: IntegrationProvider) => {
    let row = s.integrations.find((i) => i.provider === provider);
    if (!row) {
      row = { provider, connected: false, config: {}, connected_at: null, updated_at: now() };
      s.integrations.push(row);
    }
    return row;
  };
  if (patch.google) {
    const row = ensure("google");
    const g = patch.google;
    if (g.connected !== undefined) row.connected = g.connected;
    if (g.refresh_token !== undefined) row.config.refresh_token = g.refresh_token;
    if (g.calendar_id !== undefined) row.config.calendar_id = g.calendar_id;
    if (g.connected_email !== undefined) row.config.connected_email = g.connected_email;
    if (g.connected_at !== undefined) row.connected_at = g.connected_at;
    row.updated_at = now();
  }
  if (patch.stripe) {
    const row = ensure("stripe");
    if (patch.stripe.account_label !== undefined) row.config.account_label = patch.stripe.account_label;
    row.updated_at = now();
  }
  return getIntegrationSettings();
}

// ---- Purchases ------------------------------------------------------------

export async function listPurchases(): Promise<Purchase[]> {
  return db()
    .purchases.filter((p) => !p.archived_at)
    .sort((a, b) =>
      a.purchased_at === b.purchased_at
        ? a.created_at < b.created_at ? 1 : -1
        : a.purchased_at < b.purchased_at ? 1 : -1,
    )
    .map(clone);
}

export async function listPurchasesForCustomer(customerId: string): Promise<Purchase[]> {
  return (await listPurchases()).filter((p) => p.customer_id === customerId);
}

export async function listPurchasesForProduct(productId: string): Promise<Purchase[]> {
  return (await listPurchases()).filter((p) => p.product_id === productId);
}

export async function recordPurchase(input: {
  customer_id: string;
  product_id: string;
  purchased_at?: string;
  status?: Purchase["status"];
  unit_amount?: number;
}): Promise<Purchase | null> {
  const s = db();
  const c = s.customers.find((x) => x.id === input.customer_id);
  const p = s.products.find((x) => x.id === input.product_id);
  if (!c || !p) return null;
  s.seq.purchase += 1;
  const ts = now();
  const purchase: Purchase = {
    id: randomUUID(),
    purchase_ref: `P-${String(s.seq.purchase).padStart(6, "0")}`,
    customer_id: c.id,
    customer_name: c.name,
    product_id: p.id,
    product_name: p.name,
    unit_amount: input.unit_amount ?? p.price,
    currency: p.currency,
    status: input.status ?? "paid",
    purchased_at: input.purchased_at || currentDate(),
    billing_type: p.billing_type,
    period_start: null,
    period_end: null,
    sub_status: p.billing_type === "subscription" ? "active" : "none",
    canceled_at: null,
    external_ref: null,
    archived_at: null,
    created_at: ts,
    updated_at: ts,
  };
  s.purchases.unshift(purchase);
  return clone(purchase);
}

export async function archivePurchase(id: string): Promise<void> {
  const p = db().purchases.find((x) => x.id === id);
  if (p) p.archived_at = now();
}

export async function currentProductsFor(customerId: string): Promise<string[]> {
  const names = new Set<string>();
  for (const p of await listPurchasesForCustomer(customerId)) {
    if (p.status === "paid") names.add(p.product_name);
  }
  return [...names];
}

// ---- Forms ----------------------------------------------------------------

export async function listForms(): Promise<CrmForm[]> {
  return db()
    .forms.filter((f) => !f.archived_at)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map(clone);
}

export async function getForm(id: string): Promise<CrmForm | null> {
  const f = db().forms.find((x) => x.id === id && !x.archived_at);
  return f ? clone(f) : null;
}

export async function getFormByToken(token: string): Promise<CrmForm | null> {
  const f = db().forms.find((x) => x.token === token && x.active && !x.archived_at);
  return f ? clone(f) : null;
}

export async function getFormBySlug(slug: string): Promise<CrmForm | null> {
  const f = db().forms.find((x) => x.slug === slug && x.active && !x.archived_at);
  return f ? clone(f) : null;
}

function slugify(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  const s = db();
  let slug = base || "form";
  let i = 1;
  while (s.forms.some((f) => f.slug === slug)) slug = `${base}-${++i}`;
  return slug;
}

export async function createForm(input: {
  name: string;
  fields: FormFieldDef[];
  mapping: FormMapping;
  create_customer?: boolean;
}): Promise<CrmForm> {
  const s = db();
  const ts = now();
  const f: CrmForm = {
    id: randomUUID(),
    name: input.name.trim(),
    slug: slugify(input.name),
    token: randomUUID().replace(/-/g, ""),
    fields: input.fields,
    mapping: input.mapping,
    create_customer: input.create_customer ?? true,
    active: true,
    archived_at: null,
    created_at: ts,
    updated_at: ts,
  };
  s.forms.unshift(f);
  return clone(f);
}

export async function updateForm(
  id: string,
  patch: Partial<Pick<CrmForm, "name" | "fields" | "mapping" | "active" | "create_customer">>,
): Promise<CrmForm | null> {
  const s = db();
  const f = s.forms.find((x) => x.id === id);
  if (!f) return null;
  Object.assign(f, patch);
  if (patch.name) f.name = patch.name.trim();
  f.updated_at = now();
  return clone(f);
}

export async function archiveForm(id: string): Promise<void> {
  const f = db().forms.find((x) => x.id === id);
  if (f) f.archived_at = now();
}

// ---- Submissions ----------------------------------------------------------

export async function listSubmissions(formId?: string): Promise<FormSubmission[]> {
  return db()
    .submissions.filter((sub) => !formId || sub.form_id === formId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map(clone);
}

export async function recordSubmission(input: {
  form_id: string;
  payload: Record<string, unknown>;
  mapped: Record<string, unknown>;
  customer_id: string | null;
  source_ip?: string | null;
  utm?: UtmParams;
  status?: string;
}): Promise<FormSubmission> {
  const s = db();
  const sub: FormSubmission = {
    id: randomUUID(),
    form_id: input.form_id,
    payload: input.payload,
    mapped: input.mapped,
    customer_id: input.customer_id,
    source_ip: input.source_ip ?? null,
    utm: input.utm ?? {},
    status: input.status ?? "received",
    created_at: now(),
  };
  s.submissions.unshift(sub);
  return clone(sub);
}

// ---- Automations ----------------------------------------------------------

export async function listAutomations(): Promise<Automation[]> {
  return db()
    .automations.filter((a) => !a.archived_at)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map(clone);
}

export async function getAutomation(id: string): Promise<Automation | null> {
  const a = db().automations.find((x) => x.id === id && !x.archived_at);
  return a ? clone(a) : null;
}

export async function createAutomation(input: {
  name: string;
  description?: string | null;
  trigger: AutomationTrigger;
  steps: AutomationStep[];
  active?: boolean;
}): Promise<Automation> {
  const s = db();
  const ts = now();
  const a: Automation = {
    id: randomUUID(),
    name: input.name.trim(),
    description: input.description?.trim() || null,
    trigger: input.trigger,
    steps: input.steps,
    active: input.active ?? true,
    archived_at: null,
    created_at: ts,
    updated_at: ts,
  };
  s.automations.unshift(a);
  return clone(a);
}

export async function updateAutomation(
  id: string,
  patch: Partial<Pick<Automation, "name" | "description" | "trigger" | "steps" | "active">>,
): Promise<Automation | null> {
  const s = db();
  const a = s.automations.find((x) => x.id === id);
  if (!a) return null;
  if (patch.name !== undefined) a.name = patch.name.trim();
  if (patch.description !== undefined) a.description = patch.description?.trim() || null;
  if (patch.trigger !== undefined) a.trigger = patch.trigger;
  if (patch.steps !== undefined) a.steps = patch.steps;
  if (patch.active !== undefined) a.active = patch.active;
  a.updated_at = now();
  return clone(a);
}

export async function archiveAutomation(id: string): Promise<void> {
  const a = db().automations.find((x) => x.id === id);
  if (a) a.archived_at = now();
}

// ---- Automation enrollments + step runs ------------------------------------

export async function listEnrollments(filter: EnrollmentFilter = {}): Promise<AutomationEnrollment[]> {
  return db()
    .enrollments.filter(
      (e) =>
        (!filter.automationId || e.automation_id === filter.automationId) &&
        (!filter.customerId || e.customer_id === filter.customerId) &&
        (!filter.status || e.status === filter.status),
    )
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map(clone);
}

export async function getEnrollment(id: string): Promise<AutomationEnrollment | null> {
  const e = db().enrollments.find((x) => x.id === id);
  return e ? clone(e) : null;
}

export async function enrollContact(
  automationId: string,
  customerId: string,
): Promise<AutomationEnrollment | null> {
  const s = db();
  const automation = s.automations.find((a) => a.id === automationId && !a.archived_at);
  const customer = s.customers.find((c) => c.id === customerId);
  if (!automation || !customer) return null;
  const existing = s.enrollments.find(
    (e) => e.automation_id === automationId && e.customer_id === customerId && e.status === "active",
  );
  if (existing) return clone(existing);
  const ts = now();
  const enrollment: AutomationEnrollment = {
    id: randomUUID(),
    automation_id: automationId,
    customer_id: customerId,
    customer_name: customer.name,
    customer_email: customer.email,
    status: "active",
    current_step: 0,
    next_run_at: ts,
    context: { name: customer.name, email: customer.email ?? "", custom: customer.custom_fields },
    created_at: ts,
    updated_at: ts,
  };
  s.enrollments.unshift(enrollment);
  return clone(enrollment);
}

export async function updateEnrollment(
  id: string,
  patch: Partial<Pick<AutomationEnrollment, "status" | "current_step" | "next_run_at" | "context">>,
): Promise<AutomationEnrollment | null> {
  const s = db();
  const e = s.enrollments.find((x) => x.id === id);
  if (!e) return null;
  Object.assign(e, patch);
  e.updated_at = now();
  return clone(e);
}

export async function cancelEnrollment(id: string): Promise<void> {
  const e = db().enrollments.find((x) => x.id === id);
  if (e && e.status === "active") {
    e.status = "canceled";
    e.next_run_at = null;
    e.updated_at = now();
  }
}

export async function claimDueEnrollments(nowISO: string, limit: number): Promise<AutomationEnrollment[]> {
  const nowMs = new Date(nowISO).getTime();
  return db()
    .enrollments.filter(
      (e) => e.status === "active" && e.next_run_at != null && new Date(e.next_run_at).getTime() <= nowMs,
    )
    .sort((a, b) => ((a.next_run_at ?? "") < (b.next_run_at ?? "") ? -1 : 1))
    .slice(0, limit)
    .map(clone);
}

export async function recordStepRun(input: {
  enrollment_id: string;
  step_index: number;
  step_type: AutomationStep["type"];
  detail: string;
  message_id?: string | null;
  error?: string | null;
}): Promise<AutomationStepRun> {
  const s = db();
  const run: AutomationStepRun = {
    id: randomUUID(),
    enrollment_id: input.enrollment_id,
    step_index: input.step_index,
    step_type: input.step_type,
    detail: input.detail,
    message_id: input.message_id ?? null,
    error: input.error ?? null,
    ran_at: now(),
  };
  s.stepRuns.push(run);
  return clone(run);
}

export async function listStepRuns(enrollmentId: string): Promise<AutomationStepRun[]> {
  return db()
    .stepRuns.filter((r) => r.enrollment_id === enrollmentId)
    .sort((a, b) => (a.ran_at < b.ran_at ? -1 : 1))
    .map(clone);
}

// ---- Notes ----------------------------------------------------------------

export async function listNotes(customerId: string): Promise<Note[]> {
  return db()
    .notes.filter((n) => n.customer_id === customerId && !n.archived_at)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map(clone);
}

export async function createNote(input: {
  customer_id: string;
  body: string;
  created_by?: string | null;
}): Promise<Note> {
  const s = db();
  const ts = now();
  const n: Note = {
    id: randomUUID(),
    customer_id: input.customer_id,
    body: input.body.trim(),
    created_by: input.created_by ?? null,
    archived_at: null,
    created_at: ts,
    updated_at: ts,
  };
  s.notes.unshift(n);
  return clone(n);
}

export async function archiveNote(id: string): Promise<void> {
  const n = db().notes.find((x) => x.id === id);
  if (n) n.archived_at = now();
}

// ---- Activities (customer timeline) ----------------------------------------

export async function listActivities(customerId: string): Promise<Activity[]> {
  return db()
    .activities.filter((a) => a.customer_id === customerId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map(clone);
}

export async function recordActivity(input: {
  customer_id: string;
  type: ActivityType;
  payload?: Record<string, unknown>;
  created_by?: string | null;
}): Promise<Activity> {
  const s = db();
  const a: Activity = {
    id: randomUUID(),
    customer_id: input.customer_id,
    type: input.type,
    payload: input.payload ?? {},
    created_by: input.created_by ?? null,
    created_at: now(),
  };
  s.activities.unshift(a);
  return clone(a);
}

// ---- Emails ---------------------------------------------------------------

export async function listEmails(customerId: string): Promise<EmailRecord[]> {
  return db()
    .emails.filter((e) => e.customer_id === customerId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map(clone);
}

export async function recordEmail(input: {
  customer_id: string | null;
  provider_id?: string | null;
  subject: string;
  body?: string | null;
  status?: EmailRecord["status"];
  sent_at?: string | null;
}): Promise<EmailRecord> {
  const s = db();
  const e: EmailRecord = {
    id: randomUUID(),
    customer_id: input.customer_id,
    provider_id: input.provider_id ?? null,
    subject: input.subject,
    body: input.body ?? null,
    status: input.status ?? "sent",
    sent_at: input.sent_at ?? now(),
    opened_at: null,
    clicked_at: null,
    created_at: now(),
  };
  s.emails.unshift(e);
  return clone(e);
}

// ---- Deals + pipeline ------------------------------------------------------

export async function listPipelineStages(): Promise<PipelineStage[]> {
  return db().pipelineStages.slice().sort((a, b) => a.position - b.position).map(clone);
}

export async function listDeals(customerId?: string): Promise<Deal[]> {
  return db()
    .deals.filter((d) => !d.archived_at && (!customerId || d.customer_id === customerId))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map(clone);
}

export async function createDeal(input: {
  customer_id: string;
  title: string;
  stage_id?: string | null;
  value?: number;
  currency?: string;
  probability?: number;
  expected_close_date?: string | null;
  owner_id?: string | null;
}): Promise<Deal> {
  const s = db();
  const ts = now();
  const d: Deal = {
    id: randomUUID(),
    customer_id: input.customer_id,
    title: input.title.trim(),
    stage_id: input.stage_id ?? null,
    value: input.value ?? 0,
    currency: input.currency ?? "USD",
    probability: input.probability ?? 0,
    expected_close_date: input.expected_close_date ?? null,
    owner_id: input.owner_id ?? null,
    status: "open",
    closed_at: null,
    archived_at: null,
    created_at: ts,
    updated_at: ts,
  };
  s.deals.unshift(d);
  return clone(d);
}

export async function updateDeal(
  id: string,
  patch: Partial<
    Pick<Deal, "title" | "stage_id" | "value" | "currency" | "probability" | "expected_close_date" | "owner_id" | "status" | "closed_at">
  >,
): Promise<Deal | null> {
  const s = db();
  const d = s.deals.find((x) => x.id === id);
  if (!d) return null;
  Object.assign(d, patch);
  if (patch.title !== undefined) d.title = patch.title.trim();
  d.updated_at = now();
  return clone(d);
}

export async function archiveDeal(id: string): Promise<void> {
  const d = db().deals.find((x) => x.id === id);
  if (d) d.archived_at = now();
}

// ---- Attachments -----------------------------------------------------------

export async function listAttachments(customerId: string): Promise<Attachment[]> {
  return db()
    .attachments.filter((a) => a.customer_id === customerId)
    .sort((a, b) => (a.uploaded_at < b.uploaded_at ? 1 : -1))
    .map(clone);
}

export async function createAttachment(input: {
  customer_id: string;
  filename: string;
  mime_type?: string | null;
  size?: number | null;
  url: string;
  uploaded_by?: string | null;
}): Promise<Attachment> {
  const s = db();
  const a: Attachment = {
    id: randomUUID(),
    customer_id: input.customer_id,
    filename: input.filename,
    mime_type: input.mime_type ?? null,
    size: input.size ?? null,
    url: input.url,
    uploaded_by: input.uploaded_by ?? null,
    uploaded_at: now(),
  };
  s.attachments.unshift(a);
  return clone(a);
}

export async function archiveAttachment(id: string): Promise<void> {
  const s = db();
  s.attachments = s.attachments.filter((a) => a.id !== id);
}

// ---- Audit logs (system) ---------------------------------------------------

export async function listAuditLogs(limit = 200): Promise<AuditLog[]> {
  return db()
    .auditLogs.slice()
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, limit)
    .map(clone);
}

export async function recordAuditLog(input: {
  actor_id?: string | null;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ip?: string | null;
}): Promise<AuditLog> {
  const s = db();
  const log: AuditLog = {
    id: randomUUID(),
    actor_id: input.actor_id ?? null,
    action: input.action,
    entity_type: input.entity_type ?? null,
    entity_id: input.entity_id ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
    ip: input.ip ?? null,
    created_at: now(),
  };
  s.auditLogs.unshift(log);
  return clone(log);
}
