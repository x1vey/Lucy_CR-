"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  archiveAutomation,
  archiveCalendar,
  archiveCustomer,
  archiveForm,
  archiveProduct,
  archivePurchase,
  archiveTag,
  cancelEnrollment,
  createAutomation,
  createCalendar,
  createCustomer,
  createForm,
  createProduct,
  createTag,
  enrollContact,
  recordPurchase,
  setCustomerTags,
  tagsForCustomer,
  updateAutomation,
  updateCalendar,
  updateCustomer,
  updateForm,
  updateProduct,
  updateTag,
} from "@/lib/db";
import { disconnectGoogle } from "@/lib/google";
import { enrollFromTag } from "@/lib/automations/triggers";
import { runDueEnrollments } from "@/lib/automations/runner";
import type { CalendarInput } from "@/lib/db";
import type {
  AutomationStep,
  AutomationTrigger,
  FormFieldDef,
  FormMapping,
  WeeklyHours,
} from "@/lib/types";

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
  // Diff before/after so tag-added automations only fire for genuinely new tags.
  const before = new Set((await tagsForCustomer(id)).map((t) => t.id));
  await setCustomerTags(id, tagIds);
  const added = tagIds.filter((t) => !before.has(t));
  if (added.length) await enrollFromTag(added, [id]);
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

// ---- Calendars ------------------------------------------------------------

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

const openWindowSchema = z
  .object({
    start: z.string().regex(HHMM, "Use HH:MM"),
    end: z.string().regex(HHMM, "Use HH:MM"),
  })
  .refine((w) => w.start < w.end, { message: "End must be after start" });

// weekly_hours is a map keyed by weekday 0..6. z.record with a numeric-string
// key, coerced back to numbers when consumed.
const weeklyHoursSchema = z.record(z.array(openWindowSchema));

const calendarConfigSchema = z.object({
  utc_offset_minutes: z.coerce.number().int().min(-720).max(840),
  timezone_label: z.string().trim().min(1).default("UTC"),
  slot_minutes: z.coerce.number().refine((n) => [15, 30, 45, 60].includes(n), {
    message: "Slot length must be 15, 30, 45 or 60 minutes",
  }),
  weekly_hours: weeklyHoursSchema,
  lead_time_minutes: z.coerce.number().int().min(0).max(60 * 24 * 30),
  window_days: z.coerce.number().int().min(1).max(365),
  paid: z.boolean().default(false),
  busyness: z.object({
    enabled: z.boolean().default(false),
    fraction: z.coerce.number().min(0).max(1).default(0),
    epoch_days: z.coerce.number().int().min(0).max(365).default(1),
  }),
});

const calendarSchema = z.object({
  name: z.string().trim().min(1, "Calendar name is required"),
  description: z.string().trim().optional().or(z.literal("")),
  price: z.coerce.number().min(0, "Price can't be negative"),
  currency: z.string().trim().length(3).default("USD"),
  config: calendarConfigSchema,
});

// Normalise the validated weekly_hours (string keys) into the numeric-keyed
// WeeklyHours the app uses, dropping empty days.
function toWeeklyHours(
  raw: z.infer<typeof weeklyHoursSchema>,
): WeeklyHours {
  const out: WeeklyHours = {};
  for (const [k, windows] of Object.entries(raw)) {
    const day = Number(k);
    if (Number.isInteger(day) && day >= 0 && day <= 6 && windows.length) {
      out[day] = windows;
    }
  }
  return out;
}

export interface CalendarActionInput {
  name: string;
  description?: string;
  price: number;
  currency?: string;
  config: {
    utc_offset_minutes: number;
    timezone_label: string;
    slot_minutes: number;
    weekly_hours: Record<string, { start: string; end: string }[]>;
    lead_time_minutes: number;
    window_days: number;
    paid: boolean;
    busyness: { enabled: boolean; fraction: number; epoch_days: number };
  };
}

// Map the validated action input to the flat CalendarInput the repository takes.
function buildCalendarInput(data: z.infer<typeof calendarSchema>): CalendarInput {
  return {
    name: data.name,
    description: data.description || null,
    price: data.price,
    currency: data.currency,
    paid: data.config.paid,
    slot_minutes: data.config.slot_minutes,
    utc_offset_minutes: data.config.utc_offset_minutes,
    timezone_label: data.config.timezone_label,
    lead_time_minutes: data.config.lead_time_minutes,
    window_days: data.config.window_days,
    weekly_hours: toWeeklyHours(data.config.weekly_hours),
    busyness: data.config.busyness,
  };
}

export async function createCalendarAction(input: CalendarActionInput) {
  const data = calendarSchema.parse(input);
  const cal = await createCalendar(buildCalendarInput(data));
  revalidateAll();
  return { id: cal.id, slug: cal.slug };
}

export async function updateCalendarAction(
  id: string,
  input: CalendarActionInput,
) {
  const data = calendarSchema.parse(input);
  // Bookings are their own table now, so a config edit never touches them.
  await updateCalendar(id, buildCalendarInput(data));
  revalidateAll();
}

export async function archiveCalendarAction(id: string) {
  await archiveCalendar(id);
  revalidateAll();
}

// ---- Integrations ---------------------------------------------------------

export async function disconnectGoogleAction() {
  await disconnectGoogle();
  revalidateAll();
}

// ---- Automations ----------------------------------------------------------

const triggerSchema = z.object({
  kind: z.enum(["form_submission", "tag_added", "manual"]),
  form_id: z.string().optional().nullable(),
  tag_id: z.string().optional().nullable(),
});

const stepSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("email"),
    subject: z.string().trim().min(1, "Email subject is required"),
    body: z.string().trim().min(1, "Email body is required"),
    from_name: z.string().trim().optional().nullable(),
  }),
  z.object({
    type: z.literal("tag"),
    tag_id: z.string().min(1, "Choose a tag"),
    action: z.enum(["add", "remove"]),
  }),
  z.object({
    type: z.literal("wait"),
    minutes: z.coerce.number().int().min(1, "Wait must be at least 1 minute"),
  }),
]);

const automationSchema = z.object({
  name: z.string().trim().min(1, "Automation name is required"),
  description: z.string().trim().optional().or(z.literal("")),
  trigger: triggerSchema,
  steps: z.array(stepSchema).min(1, "Add at least one step"),
  active: z.boolean().default(true),
});

export interface AutomationActionInput {
  name: string;
  description?: string;
  trigger: AutomationTrigger;
  steps: AutomationStep[];
  active: boolean;
}

export async function createAutomationAction(input: AutomationActionInput) {
  const data = automationSchema.parse(input);
  const a = await createAutomation({
    name: data.name,
    description: data.description || null,
    trigger: data.trigger as AutomationTrigger,
    steps: data.steps as AutomationStep[],
    active: data.active,
  });
  revalidateAll();
  return { id: a.id };
}

export async function updateAutomationAction(
  id: string,
  input: AutomationActionInput,
) {
  const data = automationSchema.parse(input);
  await updateAutomation(id, {
    name: data.name,
    description: data.description || null,
    trigger: data.trigger as AutomationTrigger,
    steps: data.steps as AutomationStep[],
    active: data.active,
  });
  revalidateAll();
}

export async function setAutomationActiveAction(id: string, active: boolean) {
  await updateAutomation(id, { active });
  revalidateAll();
}

export async function archiveAutomationAction(id: string) {
  await archiveAutomation(id);
  revalidateAll();
}

const enrollSchema = z.object({
  automation_id: z.string().min(1),
  customer_ids: z.array(z.string().min(1)).min(1, "Select at least one contact"),
});

export async function enrollContactsAction(
  automationId: string,
  customerIds: string[],
) {
  const data = enrollSchema.parse({
    automation_id: automationId,
    customer_ids: customerIds,
  });
  for (const cid of data.customer_ids) {
    await enrollContact(data.automation_id, cid);
  }
  // Advance immediately so the first non-wait steps fire at enroll time.
  await runDueEnrollments();
  revalidateAll();
}

export async function cancelEnrollmentAction(id: string) {
  await cancelEnrollment(id);
  revalidateAll();
}

/** Manual "Run now" — advance all due enrollments (demo substitute for cron). */
export async function runTickAction() {
  const summary = await runDueEnrollments();
  revalidateAll();
  return summary;
}
