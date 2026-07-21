import "server-only";

import { randomUUID } from "crypto";
import { currentDate, db, now } from "@/lib/db/store";
import type { CustomerWithTags, TagActivityFilter } from "@/lib/db/shared";
import type {
  Admin,
  AdminSafe,
  CrmForm,
  Customer,
  FormFieldDef,
  FormMapping,
  FormSubmission,
  Product,
  Purchase,
  Tag,
  TagActivity,
  UtmParams,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// In-memory repository backend.
//
// This is the original synchronous repository logic, now exposed as async
// functions so it shares one signature with the Supabase backend. All state
// lives in src/lib/db/store.ts. Used automatically when Supabase isn't
// configured (see src/lib/db/index.ts dispatcher).
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

/** Includes the password hash — for login verification only. */
export async function getAdminByEmailWithHash(
  email: string,
): Promise<Admin | null> {
  const e = email.trim().toLowerCase();
  const a = db().admins.find(
    (x) => x.email.toLowerCase() === e && !x.archived_at,
  );
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
  const s = db();
  const a = s.admins.find((x) => x.id === id);
  if (a) a.archived_at = now();
}

export async function setAdminLastLogin(id: string): Promise<void> {
  const s = db();
  const a = s.admins.find((x) => x.id === id);
  if (a) a.last_login_at = now();
}

/** Count of live admins — used to guard against archiving the last one. */
export async function liveAdminCount(): Promise<number> {
  return db().admins.filter((a) => !a.archived_at).length;
}

// ---- Customers ------------------------------------------------------------

export async function listCustomers(): Promise<CustomerWithTags[]> {
  const s = db();
  const live = s.customers
    .filter((c) => !c.archived_at)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return live.map((c) => ({ ...clone(c), tags: tagsForCustomerSync(c.id) }));
}

export async function getCustomer(id: string): Promise<CustomerWithTags | null> {
  const s = db();
  const c = s.customers.find((x) => x.id === id && !x.archived_at);
  if (!c) return null;
  return { ...clone(c), tags: tagsForCustomerSync(c.id) };
}

export async function createCustomer(input: {
  name: string;
  email?: string | null;
  notes?: string | null;
}): Promise<Customer> {
  const s = db();
  const ts = now();
  const c: Customer = {
    id: randomUUID(),
    name: input.name.trim(),
    email: input.email?.trim() || null,
    notes: input.notes?.trim() || null,
    custom_fields: {},
    utm: {},
    hidden: false,
    archived_at: null,
    created_at: ts,
    updated_at: ts,
  };
  s.customers.unshift(c);
  return clone(c);
}

/**
 * Record first-touch UTM attribution on a contact. Only fills in keys that
 * aren't already set, so the earliest source that touched a contact wins and a
 * later submission never overwrites it.
 */
export async function setCustomerUtm(
  id: string,
  utm: UtmParams,
): Promise<Customer | null> {
  const s = db();
  const c = s.customers.find((x) => x.id === id);
  if (!c) return null;
  let changed = false;
  for (const [k, v] of Object.entries(utm)) {
    if (v && !c.utm[k as keyof UtmParams]) {
      c.utm[k as keyof UtmParams] = v;
      changed = true;
    }
  }
  if (changed) c.updated_at = now();
  return clone(c);
}

export async function updateCustomer(
  id: string,
  patch: Partial<Pick<Customer, "name" | "email" | "notes">>,
): Promise<Customer | null> {
  const s = db();
  const c = s.customers.find((x) => x.id === id);
  if (!c) return null;
  if (patch.name !== undefined) c.name = patch.name.trim();
  if (patch.email !== undefined) c.email = patch.email?.trim() || null;
  if (patch.notes !== undefined) c.notes = patch.notes?.trim() || null;
  c.updated_at = now();
  return clone(c);
}

export async function archiveCustomer(id: string): Promise<void> {
  const s = db();
  const c = s.customers.find((x) => x.id === id);
  if (c) c.archived_at = now();
}

export async function upsertCustomerByEmail(input: {
  name: string;
  email?: string | null;
  notes?: string | null;
}): Promise<{ customer: Customer; created: boolean }> {
  const s = db();
  const email = input.email?.trim().toLowerCase();
  if (email) {
    const existing = s.customers.find(
      (c) => !c.archived_at && c.email?.toLowerCase() === email,
    );
    if (existing) {
      if (input.notes && !existing.notes) existing.notes = input.notes;
      existing.updated_at = now();
      return { customer: clone(existing), created: false };
    }
  }
  return { customer: await createCustomer(input), created: true };
}

// ---- Tags (single activity-log table) -------------------------------------
//
// All tag state lives in one array of activity rows (store.tagActivity). The
// tag catalogue and per-contact membership are DERIVED from it:
//   * the "created" row holds a tag's identity, name/colour, and delete state
//   * "added"/"removed" rows carry who_ids/who_names (possibly many contacts)
//   * a contact currently has a tag iff its most recent add/remove row for that
//     tag is an "added"

/** The "created" rows, keyed by tag_id — the tag catalogue. */
function createdRows(): TagActivity[] {
  return db().tagActivity.filter((r) => r.kind === "created");
}

/** Roll a "created" row up into the derived Tag shape the UI consumes. */
function toTag(created: TagActivity): Tag {
  return {
    id: created.tag_id,
    name: created.name,
    color: created.color,
    archived_at: created.archived_at,
    created_at: created.created_at,
    updated_at: created.created_at,
  };
}

/** Set of tag_ids a contact currently has (latest add/remove per tag wins). */
function currentTagIdsFor(customerId: string): Set<string> {
  const rows = db()
    .tagActivity.filter(
      (r) => r.kind !== "created" && r.who_ids.includes(customerId),
    )
    // Oldest first so the last write wins.
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  const state = new Map<string, boolean>();
  for (const r of rows) state.set(r.tag_id, r.kind === "added");
  const on = new Set<string>();
  for (const [tagId, isOn] of state) if (isOn) on.add(tagId);
  return on;
}

export async function listTagActivity(
  filter: TagActivityFilter = {},
): Promise<TagActivity[]> {
  return db()
    .tagActivity.filter(
      (r) =>
        (!filter.tagId || r.tag_id === filter.tagId) &&
        (!filter.kind || r.kind === filter.kind) &&
        (!filter.customerId || r.who_ids.includes(filter.customerId)),
    )
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map(clone);
}

export async function listTags(): Promise<Tag[]> {
  return createdRows()
    .filter((r) => !r.archived_at)
    .map(toTag)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function tagsForCustomerSync(customerId: string): Tag[] {
  const on = currentTagIdsFor(customerId);
  return createdRows()
    .filter((r) => !r.archived_at && on.has(r.tag_id))
    .map(toTag)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function tagsForCustomer(customerId: string): Promise<Tag[]> {
  return tagsForCustomerSync(customerId);
}

export async function createTag(name: string, color: string): Promise<Tag> {
  const s = db();
  const row: TagActivity = {
    id: randomUUID(),
    tag_id: randomUUID(),
    kind: "created",
    name: name.trim(),
    color,
    who_ids: [],
    who_names: [],
    archived_at: null,
    created_at: now(),
  };
  s.tagActivity.push(row);
  return toTag(row);
}

export async function updateTag(
  id: string,
  patch: Partial<Pick<Tag, "name" | "color">>,
): Promise<Tag | null> {
  const s = db();
  // Edit the "created" row in place — it's the tag's identity/snapshot source.
  const created = s.tagActivity.find(
    (r) => r.kind === "created" && r.tag_id === id,
  );
  if (!created) return null;
  if (patch.name !== undefined) created.name = patch.name.trim();
  if (patch.color !== undefined) created.color = patch.color;
  return toTag(created);
}

export async function archiveTag(id: string): Promise<void> {
  const s = db();
  const created = s.tagActivity.find(
    (r) => r.kind === "created" && r.tag_id === id,
  );
  if (created) created.archived_at = now();
}

/** Append one activity row touching the given contacts. */
function appendActivity(
  kind: "added" | "removed",
  tagId: string,
  whoIds: string[],
): void {
  const s = db();
  const created = s.tagActivity.find(
    (r) => r.kind === "created" && r.tag_id === tagId,
  );
  if (!created || whoIds.length === 0) return;
  s.tagActivity.push({
    id: randomUUID(),
    tag_id: tagId,
    kind,
    name: created.name,
    color: created.color,
    who_ids: [...whoIds],
    who_names: whoIds.map(
      (cid) => s.customers.find((c) => c.id === cid)?.name ?? "",
    ),
    archived_at: null,
    created_at: now(),
  });
}

export async function setCustomerTags(
  customerId: string,
  tagIds: string[],
): Promise<void> {
  const s = db();
  const customer = s.customers.find((c) => c.id === customerId);
  if (!customer) return;

  const before = currentTagIdsFor(customerId);
  const liveTagIds = new Set(
    createdRows().filter((r) => !r.archived_at).map((r) => r.tag_id),
  );
  const after = new Set(tagIds.filter((t) => liveTagIds.has(t)));

  for (const tagId of after) {
    if (!before.has(tagId)) appendActivity("added", tagId, [customerId]);
  }
  for (const tagId of before) {
    if (!after.has(tagId)) appendActivity("removed", tagId, [customerId]);
  }
}

export async function tagUsageCounts(): Promise<Record<string, number>> {
  const s = db();
  const counts: Record<string, number> = {};
  for (const c of s.customers) {
    if (c.archived_at) continue;
    for (const tagId of currentTagIdsFor(c.id)) {
      counts[tagId] = (counts[tagId] ?? 0) + 1;
    }
  }
  return counts;
}

export async function setCustomerTag(
  customerId: string,
  tagId: string,
  on: boolean,
): Promise<void> {
  const has = currentTagIdsFor(customerId).has(tagId);
  if (on && !has) appendActivity("added", tagId, [customerId]);
  else if (!on && has) appendActivity("removed", tagId, [customerId]);
}

export async function applyTags(
  customerId: string,
  tagIds: string[],
): Promise<void> {
  for (const id of tagIds) await setCustomerTag(customerId, id, true);
}

/**
 * Apply ONE tag to MANY contacts in a single "added" activity row (this is the
 * multi-`who` add). Contacts that already have the tag are skipped.
 */
export async function addTagToCustomers(
  tagId: string,
  customerIds: string[],
): Promise<void> {
  const fresh = customerIds.filter(
    (cid) => !currentTagIdsFor(cid).has(tagId),
  );
  appendActivity("added", tagId, fresh);
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
    source_project_id: null,
    archived_at: null,
    created_at: ts,
    updated_at: ts,
  };
  s.products.push(p);
  return clone(p);
}

export async function updateProduct(
  id: string,
  patch: Partial<
    Pick<Product, "name" | "description" | "price" | "currency" | "billing_type">
  >,
): Promise<Product | null> {
  const s = db();
  const p = s.products.find((x) => x.id === id);
  if (!p) return null;
  Object.assign(p, {
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.description !== undefined
      ? { description: patch.description?.trim() || null }
      : {}),
    ...(patch.price !== undefined ? { price: patch.price } : {}),
    ...(patch.currency !== undefined ? { currency: patch.currency } : {}),
    ...(patch.billing_type !== undefined
      ? { billing_type: patch.billing_type }
      : {}),
  });
  p.updated_at = now();
  return clone(p);
}

export async function archiveProduct(id: string): Promise<void> {
  const s = db();
  const p = s.products.find((x) => x.id === id);
  if (p) p.archived_at = now();
}

// ---- Purchases (product history ledger) -----------------------------------

export async function listPurchases(): Promise<Purchase[]> {
  return db()
    .purchases.filter((p) => !p.archived_at)
    .sort((a, b) =>
      a.purchased_at === b.purchased_at
        ? a.created_at < b.created_at
          ? 1
          : -1
        : a.purchased_at < b.purchased_at
          ? 1
          : -1,
    )
    .map(clone);
}

export async function listPurchasesForCustomer(
  customerId: string,
): Promise<Purchase[]> {
  return (await listPurchases()).filter((p) => p.customer_id === customerId);
}

export async function listPurchasesForProduct(
  productId: string,
): Promise<Purchase[]> {
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
  const s = db();
  const p = s.purchases.find((x) => x.id === id);
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
  const f = db().forms.find(
    (x) => x.token === token && x.active && !x.archived_at,
  );
  return f ? clone(f) : null;
}

export async function getFormBySlug(slug: string): Promise<CrmForm | null> {
  const f = db().forms.find(
    (x) => x.slug === slug && x.active && !x.archived_at,
  );
  return f ? clone(f) : null;
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
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
  patch: Partial<
    Pick<CrmForm, "name" | "fields" | "mapping" | "active" | "create_customer">
  >,
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
  const s = db();
  const f = s.forms.find((x) => x.id === id);
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
