import "server-only";

import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
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
// Supabase repository backend.
//
// Mirrors src/lib/db/memory.ts function-for-function, backed by the Postgres
// schema in supabase/schema.sql (customers, tags activity log, products,
// purchases, forms, form_submissions).
//
// NO AUTH: there is no profiles/staff model. This uses the service-role admin
// client, which bypasses RLS — fine because every screen is server-rendered and
// the anon key is never used for these tables. Slug/token generation and the
// tag membership derivation are done in app code so behaviour matches the
// in-memory backend exactly.
// ---------------------------------------------------------------------------

type DB = ReturnType<typeof createAdminClient>;

function sb(): DB {
  return createAdminClient();
}

// Rows come back matching src/lib/types.ts by construction (the schema mirrors
// the types), so a direct cast is safe. Centralised so it's easy to swap for a
// generated-types mapping later.
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
  const { data, error } = await db
    .from("admins")
    .select("*")
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((d) => stripHash(row<Admin>(d)));
}

export async function getAdmin(id: string): Promise<AdminSafe | null> {
  const db = sb();
  const { data, error } = await db
    .from("admins")
    .select("*")
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? stripHash(row<Admin>(data)) : null;
}

export async function getAdminByEmailWithHash(
  email: string,
): Promise<Admin | null> {
  const db = sb();
  const { data, error } = await db
    .from("admins")
    .select("*")
    .ilike("email", email.trim())
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? row<Admin>(data) : null;
}

export async function createAdmin(input: {
  email: string;
  name: string;
  password_hash: string;
  role?: Admin["role"];
}): Promise<AdminSafe> {
  const db = sb();
  const { data, error } = await db
    .from("admins")
    .insert({
      email: input.email.trim().toLowerCase(),
      name: input.name.trim(),
      password_hash: input.password_hash,
      role: input.role ?? "admin",
    })
    .select("*")
    .single();
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
  if (patch.password_hash !== undefined)
    update.password_hash = patch.password_hash;
  const { data, error } = await db
    .from("admins")
    .update(update)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? stripHash(row<Admin>(data)) : null;
}

export async function archiveAdmin(id: string): Promise<void> {
  const db = sb();
  const { error } = await db
    .from("admins")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function setAdminLastLogin(id: string): Promise<void> {
  const db = sb();
  const { error } = await db
    .from("admins")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function liveAdminCount(): Promise<number> {
  const db = sb();
  const { count, error } = await db
    .from("admins")
    .select("*", { count: "exact", head: true })
    .is("archived_at", null);
  if (error) throw error;
  return count ?? 0;
}

// ---- Customers ------------------------------------------------------------

export async function listCustomers(): Promise<CustomerWithTags[]> {
  const db = sb();
  const { data, error } = await db
    .from("customers")
    .select("*")
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const customers = (data ?? []).map((c) => row<Customer>(c));

  // Derive each contact's tags from the activity log in one fetch.
  const [catalogue, membership] = await Promise.all([
    tagCatalogue(),
    membershipMap(),
  ]);
  return customers.map((c) => ({
    ...c,
    tags: tagsFrom(catalogue, membership.get(c.id)),
  }));
}

export async function getCustomer(id: string): Promise<CustomerWithTags | null> {
  const db = sb();
  const { data, error } = await db
    .from("customers")
    .select("*")
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const customer = row<Customer>(data);
  const catalogue = await tagCatalogue();
  const on = await currentTagIdsFor(id);
  return { ...customer, tags: tagsFrom(catalogue, on) };
}

export async function createCustomer(input: {
  name: string;
  email?: string | null;
  notes?: string | null;
}): Promise<Customer> {
  const db = sb();
  const { data, error } = await db
    .from("customers")
    .insert({
      name: input.name.trim(),
      email: input.email?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return row<Customer>(data);
}

export async function updateCustomer(
  id: string,
  patch: Partial<Pick<Customer, "name" | "email" | "notes">>,
): Promise<Customer | null> {
  const db = sb();
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.email !== undefined) update.email = patch.email?.trim() || null;
  if (patch.notes !== undefined) update.notes = patch.notes?.trim() || null;
  const { data, error } = await db
    .from("customers")
    .update(update)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? row<Customer>(data) : null;
}

export async function archiveCustomer(id: string): Promise<void> {
  const db = sb();
  const { error } = await db
    .from("customers")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function upsertCustomerByEmail(input: {
  name: string;
  email?: string | null;
  notes?: string | null;
}): Promise<{ customer: Customer; created: boolean }> {
  const db = sb();
  const email = input.email?.trim();
  if (email) {
    const { data: existing, error } = await db
      .from("customers")
      .select("*")
      .is("archived_at", null)
      .ilike("email", email)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (existing) {
      const cust = row<Customer>(existing);
      if (input.notes && !cust.notes) {
        await db
          .from("customers")
          .update({ notes: input.notes })
          .eq("id", cust.id);
        cust.notes = input.notes;
      }
      return { customer: cust, created: false };
    }
  }
  return { customer: await createCustomer(input), created: true };
}

/**
 * Record first-touch UTM attribution on a contact. Only fills in keys that
 * aren't already set (read-merge-write), so the earliest source that touched a
 * contact wins and a later submission never overwrites it.
 */
export async function setCustomerUtm(
  id: string,
  utm: UtmParams,
): Promise<Customer | null> {
  const db = sb();
  const { data: existing, error: readErr } = await db
    .from("customers")
    .select("utm")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!existing) return null;

  const current = (existing.utm ?? {}) as UtmParams;
  const merged: UtmParams = { ...current };
  let changed = false;
  for (const [k, v] of Object.entries(utm)) {
    if (v && !merged[k as keyof UtmParams]) {
      merged[k as keyof UtmParams] = v;
      changed = true;
    }
  }
  if (!changed) {
    const { data } = await db
      .from("customers")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    return data ? row<Customer>(data) : null;
  }

  const { data, error } = await db
    .from("customers")
    .update({ utm: merged })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? row<Customer>(data) : null;
}

// ---- Tags (single activity-log table) -------------------------------------
//
// One `tags` table holds activity rows (created / added / removed). The tag
// catalogue and per-contact membership are derived from it — same model as the
// memory backend. Derivation is done in app code: fetch the rows, fold them.

/** The "created" rows keyed by tag_id, rolled up into the Tag shape. */
async function tagCatalogue(): Promise<Map<string, Tag>> {
  const db = sb();
  const { data, error } = await db
    .from("tags")
    .select("*")
    .eq("kind", "created");
  if (error) throw error;
  const map = new Map<string, Tag>();
  for (const r of (data ?? []) as TagActivity[]) {
    map.set(r.tag_id, {
      id: r.tag_id,
      name: r.name,
      color: r.color,
      archived_at: r.archived_at,
      created_at: r.created_at,
      updated_at: r.created_at,
    });
  }
  return map;
}

/** All add/removed rows, oldest first, so the last write wins. */
async function membershipRows(): Promise<TagActivity[]> {
  const db = sb();
  const { data, error } = await db
    .from("tags")
    .select("*")
    .in("kind", ["added", "removed"])
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TagActivity[];
}

/** customerId -> Set<tagId> currently on that contact. */
async function membershipMap(): Promise<Map<string, Set<string>>> {
  const rows = await membershipRows();
  // customerId -> tagId -> isOn (last write wins because rows are asc by time)
  const state = new Map<string, Map<string, boolean>>();
  for (const r of rows) {
    for (const cid of r.who_ids) {
      const perTag = state.get(cid) ?? new Map<string, boolean>();
      perTag.set(r.tag_id, r.kind === "added");
      state.set(cid, perTag);
    }
  }
  const out = new Map<string, Set<string>>();
  for (const [cid, perTag] of state) {
    const on = new Set<string>();
    for (const [tagId, isOn] of perTag) if (isOn) on.add(tagId);
    out.set(cid, on);
  }
  return out;
}

async function currentTagIdsFor(customerId: string): Promise<Set<string>> {
  return (await membershipMap()).get(customerId) ?? new Set<string>();
}

/** Turn a set of tag_ids + the catalogue into live, sorted Tag objects. */
function tagsFrom(catalogue: Map<string, Tag>, on?: Set<string>): Tag[] {
  if (!on) return [];
  const tags: Tag[] = [];
  for (const tagId of on) {
    const t = catalogue.get(tagId);
    if (t && !t.archived_at) tags.push(t);
  }
  return tags.sort((a, b) => a.name.localeCompare(b.name));
}

export async function listTagActivity(
  filter: TagActivityFilter = {},
): Promise<TagActivity[]> {
  const db = sb();
  let q = db.from("tags").select("*").order("created_at", { ascending: false });
  if (filter.tagId) q = q.eq("tag_id", filter.tagId);
  if (filter.kind) q = q.eq("kind", filter.kind);
  if (filter.customerId) q = q.contains("who_ids", [filter.customerId]);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((d) => row<TagActivity>(d));
}

export async function listTags(): Promise<Tag[]> {
  const catalogue = await tagCatalogue();
  return [...catalogue.values()]
    .filter((t) => !t.archived_at)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function tagsForCustomer(customerId: string): Promise<Tag[]> {
  const [catalogue, on] = await Promise.all([
    tagCatalogue(),
    currentTagIdsFor(customerId),
  ]);
  return tagsFrom(catalogue, on);
}

export async function createTag(name: string, color: string): Promise<Tag> {
  const db = sb();
  const tagId = randomUUID();
  const { data, error } = await db
    .from("tags")
    .insert({
      tag_id: tagId,
      kind: "created",
      name: name.trim(),
      color,
    })
    .select("*")
    .single();
  if (error) throw error;
  const r = row<TagActivity>(data);
  return {
    id: r.tag_id,
    name: r.name,
    color: r.color,
    archived_at: r.archived_at,
    created_at: r.created_at,
    updated_at: r.created_at,
  };
}

export async function updateTag(
  id: string,
  patch: Partial<Pick<Tag, "name" | "color">>,
): Promise<Tag | null> {
  const db = sb();
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.color !== undefined) update.color = patch.color;
  // Edit the "created" row in place — it's the tag's identity/snapshot source.
  const { data, error } = await db
    .from("tags")
    .update(update)
    .eq("tag_id", id)
    .eq("kind", "created")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = row<TagActivity>(data);
  return {
    id: r.tag_id,
    name: r.name,
    color: r.color,
    archived_at: r.archived_at,
    created_at: r.created_at,
    updated_at: r.created_at,
  };
}

export async function archiveTag(id: string): Promise<void> {
  const db = sb();
  const { error } = await db
    .from("tags")
    .update({ archived_at: new Date().toISOString() })
    .eq("tag_id", id)
    .eq("kind", "created");
  if (error) throw error;
}

/** Append one activity row touching the given contacts (snapshotting names). */
async function appendActivity(
  kind: "added" | "removed",
  tagId: string,
  whoIds: string[],
): Promise<void> {
  if (whoIds.length === 0) return;
  const db = sb();
  const catalogue = await tagCatalogue();
  const tag = catalogue.get(tagId);
  if (!tag) return;
  const { data: custs } = await db
    .from("customers")
    .select("id, name")
    .in("id", whoIds);
  const nameById = new Map(
    (custs ?? []).map((c) => [c.id as string, c.name as string]),
  );
  const { error } = await db.from("tags").insert({
    tag_id: tagId,
    kind,
    name: tag.name,
    color: tag.color,
    who_ids: whoIds,
    who_names: whoIds.map((cid) => nameById.get(cid) ?? ""),
  });
  if (error) throw error;
}

export async function setCustomerTags(
  customerId: string,
  tagIds: string[],
): Promise<void> {
  const [catalogue, before] = await Promise.all([
    tagCatalogue(),
    currentTagIdsFor(customerId),
  ]);
  const liveTagIds = new Set(
    [...catalogue.values()].filter((t) => !t.archived_at).map((t) => t.id),
  );
  const after = new Set(tagIds.filter((t) => liveTagIds.has(t)));

  for (const tagId of after) {
    if (!before.has(tagId)) await appendActivity("added", tagId, [customerId]);
  }
  for (const tagId of before) {
    if (!after.has(tagId)) await appendActivity("removed", tagId, [customerId]);
  }
}

export async function tagUsageCounts(): Promise<Record<string, number>> {
  const db = sb();
  const [membership, { data: liveCustomers, error }] = await Promise.all([
    membershipMap(),
    db.from("customers").select("id").is("archived_at", null),
  ]);
  if (error) throw error;
  const live = new Set((liveCustomers ?? []).map((c) => c.id as string));
  const counts: Record<string, number> = {};
  for (const [cid, on] of membership) {
    if (!live.has(cid)) continue;
    for (const tagId of on) counts[tagId] = (counts[tagId] ?? 0) + 1;
  }
  return counts;
}

export async function setCustomerTag(
  customerId: string,
  tagId: string,
  on: boolean,
): Promise<void> {
  const has = (await currentTagIdsFor(customerId)).has(tagId);
  if (on && !has) await appendActivity("added", tagId, [customerId]);
  else if (!on && has) await appendActivity("removed", tagId, [customerId]);
}

export async function applyTags(
  customerId: string,
  tagIds: string[],
): Promise<void> {
  for (const id of tagIds) await setCustomerTag(customerId, id, true);
}

/**
 * Apply ONE tag to MANY contacts in a single "added" activity row (the
 * multi-`who` add). Contacts that already have the tag are skipped.
 */
export async function addTagToCustomers(
  tagId: string,
  customerIds: string[],
): Promise<void> {
  const membership = await membershipMap();
  const fresh = customerIds.filter(
    (cid) => !(membership.get(cid)?.has(tagId) ?? false),
  );
  await appendActivity("added", tagId, fresh);
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
  const { data, error } = await db
    .from("products")
    .select("*")
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? row<Product>(data) : null;
}

export async function createProduct(input: {
  name: string;
  description?: string | null;
  price: number;
  currency?: string;
  billing_type?: Product["billing_type"];
}): Promise<Product> {
  const db = sb();
  const { data, error } = await db
    .from("products")
    .insert({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      price: input.price,
      currency: input.currency || "USD",
      billing_type: input.billing_type || "one_time",
    })
    .select("*")
    .single();
  if (error) throw error;
  return row<Product>(data);
}

export async function updateProduct(
  id: string,
  patch: Partial<
    Pick<Product, "name" | "description" | "price" | "currency" | "billing_type">
  >,
): Promise<Product | null> {
  const db = sb();
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.description !== undefined)
    update.description = patch.description?.trim() || null;
  if (patch.price !== undefined) update.price = patch.price;
  if (patch.currency !== undefined) update.currency = patch.currency;
  if (patch.billing_type !== undefined) update.billing_type = patch.billing_type;
  const { data, error } = await db
    .from("products")
    .update(update)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? row<Product>(data) : null;
}

export async function archiveProduct(id: string): Promise<void> {
  const db = sb();
  const { error } = await db
    .from("products")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// ---- Purchases (product history ledger) -----------------------------------

export async function listPurchases(): Promise<Purchase[]> {
  const db = sb();
  const { data, error } = await db
    .from("purchases")
    .select("*")
    .is("archived_at", null)
    .order("purchased_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((d) => row<Purchase>(d));
}

export async function listPurchasesForCustomer(
  customerId: string,
): Promise<Purchase[]> {
  const db = sb();
  const { data, error } = await db
    .from("purchases")
    .select("*")
    .is("archived_at", null)
    .eq("customer_id", customerId)
    .order("purchased_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((d) => row<Purchase>(d));
}

export async function listPurchasesForProduct(
  productId: string,
): Promise<Purchase[]> {
  const db = sb();
  const { data, error } = await db
    .from("purchases")
    .select("*")
    .is("archived_at", null)
    .eq("product_id", productId)
    .order("purchased_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((d) => row<Purchase>(d));
}

export async function recordPurchase(input: {
  customer_id: string;
  product_id: string;
  purchased_at?: string;
  status?: Purchase["status"];
  unit_amount?: number;
}): Promise<Purchase | null> {
  const db = sb();
  const { data: c } = await db
    .from("customers")
    .select("id, name")
    .eq("id", input.customer_id)
    .maybeSingle();
  const { data: p } = await db
    .from("products")
    .select("id, name, price, currency, billing_type")
    .eq("id", input.product_id)
    .maybeSingle();
  if (!c || !p) return null;

  const insert: Record<string, unknown> = {
    customer_id: c.id,
    customer_name: c.name, // snapshot
    product_id: p.id,
    product_name: p.name, // snapshot
    unit_amount: input.unit_amount ?? p.price,
    currency: p.currency,
    status: input.status ?? "paid",
    billing_type: p.billing_type,
    sub_status: p.billing_type === "subscription" ? "active" : "none",
  };
  if (input.purchased_at) insert.purchased_at = input.purchased_at;

  const { data, error } = await db
    .from("purchases")
    .insert(insert)
    .select("*")
    .single();
  if (error) throw error;
  return row<Purchase>(data);
}

export async function archivePurchase(id: string): Promise<void> {
  const db = sb();
  const { error } = await db
    .from("purchases")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
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
  const db = sb();
  const { data, error } = await db
    .from("forms")
    .select("*")
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((d) => row<CrmForm>(d));
}

export async function getForm(id: string): Promise<CrmForm | null> {
  const db = sb();
  const { data, error } = await db
    .from("forms")
    .select("*")
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? row<CrmForm>(data) : null;
}

export async function getFormByToken(token: string): Promise<CrmForm | null> {
  const db = sb();
  const { data, error } = await db
    .from("forms")
    .select("*")
    .eq("token", token)
    .eq("active", true)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? row<CrmForm>(data) : null;
}

export async function getFormBySlug(slug: string): Promise<CrmForm | null> {
  const db = sb();
  const { data, error } = await db
    .from("forms")
    .select("*")
    .eq("slug", slug)
    .eq("active", true)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? row<CrmForm>(data) : null;
}

async function uniqueSlug(name: string): Promise<string> {
  const db = sb();
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "form";
  let slug = base;
  let i = 1;
  // Loop until a free slug is found.
  for (;;) {
    const { data } = await db
      .from("forms")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!data) return slug;
    slug = `${base}-${++i}`;
  }
}

export async function createForm(input: {
  name: string;
  fields: FormFieldDef[];
  mapping: FormMapping;
  create_customer?: boolean;
}): Promise<CrmForm> {
  const db = sb();
  const slug = await uniqueSlug(input.name);
  const { data, error } = await db
    .from("forms")
    .insert({
      name: input.name.trim(),
      slug,
      fields: input.fields,
      mapping: input.mapping,
      create_customer: input.create_customer ?? true,
    })
    .select("*")
    .single();
  if (error) throw error;
  return row<CrmForm>(data);
}

export async function updateForm(
  id: string,
  patch: Partial<
    Pick<CrmForm, "name" | "fields" | "mapping" | "active" | "create_customer">
  >,
): Promise<CrmForm | null> {
  const db = sb();
  const update: Record<string, unknown> = { ...patch };
  if (patch.name !== undefined) update.name = patch.name.trim();
  const { data, error } = await db
    .from("forms")
    .update(update)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? row<CrmForm>(data) : null;
}

export async function archiveForm(id: string): Promise<void> {
  const db = sb();
  const { error } = await db
    .from("forms")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
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
  form_id: string;
  payload: Record<string, unknown>;
  mapped: Record<string, unknown>;
  customer_id: string | null;
  source_ip?: string | null;
  utm?: UtmParams;
  status?: string;
}): Promise<FormSubmission> {
  const db = sb();
  const { data, error } = await db
    .from("form_submissions")
    .insert({
      form_id: input.form_id,
      payload: input.payload,
      mapped: input.mapped,
      customer_id: input.customer_id,
      source_ip: input.source_ip ?? null,
      utm: input.utm ?? {},
      status: input.status ?? "received",
    })
    .select("*")
    .single();
  if (error) throw error;
  return row<FormSubmission>(data);
}
