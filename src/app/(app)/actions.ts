"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  archiveCustomer,
  archiveForm,
  archiveProduct,
  archivePurchase,
  archiveTag,
  createCustomer,
  createForm,
  createProduct,
  createTag,
  recordPurchase,
  setCustomerTags,
  updateCustomer,
  updateForm,
  updateProduct,
  updateTag,
} from "@/lib/db";
import type { FormFieldDef, FormMapping } from "@/lib/types";

// ---------------------------------------------------------------------------
// Server actions shared by the CRM screens.
//
// These are the app's single write surface. Today they mutate the in-memory
// repository (src/lib/db); when Supabase is wired up the repository changes but
// these action signatures stay the same. Each action re-validates the paths
// whose data it touches so Server Components refetch.
// ---------------------------------------------------------------------------

function revalidateAll() {
  // Cross-cutting writes (a purchase touches contacts, products, history and
  // analytics) — revalidate the whole app tree to keep every screen in sync.
  revalidatePath("/", "layout");
}

// ---- Contacts -------------------------------------------------------------

const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z
    .string()
    .trim()
    .email("Enter a valid email")
    .optional()
    .or(z.literal("")),
  notes: z.string().trim().optional().or(z.literal("")),
});

export async function createContactAction(input: {
  name: string;
  email?: string;
  notes?: string;
}) {
  const data = contactSchema.parse(input);
  const c = await createCustomer({
    name: data.name,
    email: data.email || null,
    notes: data.notes || null,
  });
  revalidateAll();
  return { id: c.id };
}

export async function updateContactAction(
  id: string,
  input: { name: string; email?: string; notes?: string },
) {
  const data = contactSchema.parse(input);
  await updateCustomer(id, {
    name: data.name,
    email: data.email || null,
    notes: data.notes || null,
  });
  revalidateAll();
}

export async function archiveContactAction(id: string) {
  await archiveCustomer(id);
  revalidateAll();
}

export async function setContactTagsAction(id: string, tagIds: string[]) {
  await setCustomerTags(id, tagIds);
  revalidateAll();
}

// ---- Tags -----------------------------------------------------------------

const HEX = /^#([0-9a-fA-F]{6})$/;
const tagSchema = z.object({
  name: z.string().trim().min(1, "Tag name is required"),
  color: z.string().regex(HEX, "Pick a color").default("#6366f1"),
});

export async function createTagAction(input: { name: string; color: string }) {
  const data = tagSchema.parse(input);
  const t = await createTag(data.name, data.color);
  revalidateAll();
  return { id: t.id };
}

export async function updateTagAction(
  id: string,
  input: { name: string; color: string },
) {
  const data = tagSchema.parse(input);
  await updateTag(id, data);
  revalidateAll();
}

export async function archiveTagAction(id: string) {
  await archiveTag(id);
  revalidateAll();
}

// ---- Products -------------------------------------------------------------

const productSchema = z.object({
  name: z.string().trim().min(1, "Product name is required"),
  description: z.string().trim().optional().or(z.literal("")),
  price: z.coerce.number().min(0, "Price can't be negative"),
  currency: z.string().trim().length(3).default("USD"),
  billing_type: z.enum(["one_time", "subscription"]).default("one_time"),
});

export async function createProductAction(input: {
  name: string;
  description?: string;
  price: number;
  currency?: string;
  billing_type?: "one_time" | "subscription";
}) {
  const data = productSchema.parse(input);
  const p = await createProduct({
    name: data.name,
    description: data.description || null,
    price: data.price,
    currency: data.currency,
    billing_type: data.billing_type,
  });
  revalidateAll();
  return { id: p.id };
}

export async function updateProductAction(
  id: string,
  input: {
    name: string;
    description?: string;
    price: number;
    currency?: string;
    billing_type?: "one_time" | "subscription";
  },
) {
  const data = productSchema.parse(input);
  await updateProduct(id, {
    name: data.name,
    description: data.description || null,
    price: data.price,
    currency: data.currency,
    billing_type: data.billing_type,
  });
  revalidateAll();
}

export async function archiveProductAction(id: string) {
  await archiveProduct(id);
  revalidateAll();
}

// ---- Purchases (product history) ------------------------------------------

const purchaseSchema = z.object({
  customer_id: z.string().min(1, "Choose a contact"),
  product_id: z.string().min(1, "Choose a product"),
  purchased_at: z.string().optional(),
  status: z.enum(["unpaid", "paid", "refunded"]).default("paid"),
  unit_amount: z.coerce.number().min(0).optional(),
});

export async function recordPurchaseAction(input: {
  customer_id: string;
  product_id: string;
  purchased_at?: string;
  status?: "unpaid" | "paid" | "refunded";
  unit_amount?: number;
}) {
  const data = purchaseSchema.parse(input);
  const p = await recordPurchase({
    customer_id: data.customer_id,
    product_id: data.product_id,
    purchased_at: data.purchased_at || undefined,
    status: data.status,
    unit_amount: data.unit_amount,
  });
  if (!p) throw new Error("Could not record purchase (contact or product missing)");
  revalidateAll();
  return { id: p.id };
}

export async function archivePurchaseAction(id: string) {
  await archivePurchase(id);
  revalidateAll();
}

// ---- Forms ----------------------------------------------------------------

const formFieldSchema: z.ZodType<FormFieldDef> = z.object({
  key: z.string().trim().min(1),
  label: z.string().trim().min(1),
  type: z.enum(["text", "email", "number", "textarea", "checkbox"]),
  required: z.boolean(),
});

const mappingTargetSchema = z.union([
  z.object({
    kind: z.literal("customer_field"),
    field: z.enum(["name", "email", "notes"]),
  }),
  z.object({ kind: z.literal("custom_field"), key: z.string() }),
  z.object({ kind: z.literal("ignore") }),
]);

const mappingSchema: z.ZodType<FormMapping> = z.object({
  fields: z.record(mappingTargetSchema),
  apply_tag_ids: z.array(z.string()),
});

const formSchema = z.object({
  name: z.string().trim().min(1, "Form name is required"),
  fields: z.array(formFieldSchema).min(1, "Add at least one field"),
  mapping: mappingSchema,
  create_customer: z.boolean().default(true),
});

export async function createFormAction(input: {
  name: string;
  fields: FormFieldDef[];
  mapping: FormMapping;
  create_customer: boolean;
}) {
  const data = formSchema.parse(input);
  const f = await createForm({
    name: data.name,
    fields: data.fields,
    mapping: data.mapping,
    create_customer: data.create_customer,
  });
  revalidateAll();
  return { id: f.id, slug: f.slug, token: f.token };
}

export async function updateFormAction(
  id: string,
  input: {
    name: string;
    fields: FormFieldDef[];
    mapping: FormMapping;
    create_customer: boolean;
    active: boolean;
  },
) {
  const data = formSchema.parse(input);
  await updateForm(id, {
    name: data.name,
    fields: data.fields,
    mapping: data.mapping,
    create_customer: data.create_customer,
    active: input.active,
  });
  revalidateAll();
}

export async function setFormActiveAction(id: string, active: boolean) {
  await updateForm(id, { active });
  revalidateAll();
}

export async function archiveFormAction(id: string) {
  await archiveForm(id);
  revalidateAll();
}
