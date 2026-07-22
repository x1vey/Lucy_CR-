import "server-only";

import { DEMO_ADMIN_HASH } from "@/lib/password";
import type {
  Activity,
  Admin,
  Attachment,
  Automation,
  AutomationEnrollment,
  AutomationStepRun,
  Booking,
  Calendar,
  CrmForm,
  Customer,
  CustomerTag,
  Deal,
  EmailRecord,
  FormSubmission,
  IntegrationRow,
  Note,
  PipelineStage,
  Product,
  Purchase,
  Tag,
  TagHistory,
  AuditLog,
} from "@/lib/db/shared";

// ---------------------------------------------------------------------------
// In-memory data store (v2 relational shape).
//
// The single stand-in for Postgres: plain arrays seeded with demo data, one per
// table in supabase/schema.sql. All repository functions in src/lib/db/memory.ts
// read/write here. Attached to globalThis so state survives dev hot-reloads.
// ---------------------------------------------------------------------------

export interface Store {
  admins: Admin[];
  customers: Customer[];
  tags: Tag[]; // catalogue
  customerTags: CustomerTag[]; // current membership (join)
  tagHistory: TagHistory[]; // append-only audit
  products: Product[]; // plain sellables only
  purchases: Purchase[];
  calendars: Calendar[];
  bookings: Booking[];
  integrations: IntegrationRow[]; // one row per provider
  forms: CrmForm[];
  submissions: FormSubmission[];
  automations: Automation[];
  enrollments: AutomationEnrollment[];
  stepRuns: AutomationStepRun[];
  notes: Note[];
  activities: Activity[];
  emails: EmailRecord[];
  deals: Deal[];
  pipelineStages: PipelineStage[];
  attachments: Attachment[];
  auditLogs: AuditLog[];
  seq: { purchase: number };
}

function nowISO() {
  return new Date().toISOString();
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function seed(): Store {
  const ts = nowISO();

  const admins: Admin[] = [
    {
      id: "admin-1",
      email: "admin@lucy.crm",
      name: "Lucy Admin",
      password_hash: DEMO_ADMIN_HASH,
      role: "owner",
      last_login_at: null,
      archived_at: null,
      created_at: ts,
      updated_at: ts,
    },
  ];

  const mkCustomer = (
    id: string,
    name: string,
    email: string,
    extra: Partial<Customer> = {},
  ): Customer => ({
    id,
    name,
    email,
    phone: null,
    company: null,
    status: "lead",
    lead_source: null,
    owner_id: "admin-1",
    created_by: "admin-1",
    notes: null,
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
    ...extra,
  });

  const customers: Customer[] = [
    mkCustomer("cust-1", "Ava Thompson", "ava@example.com", {
      company: "Thompson Studio",
      status: "customer",
      lead_source: "form",
    }),
    mkCustomer("cust-2", "Liam Chen", "liam@example.com", { status: "active" }),
    mkCustomer("cust-3", "Sofia Ramirez", "sofia@example.com"),
    mkCustomer("cust-4", "Noah Patel", "noah@example.com"),
    mkCustomer("cust-5", "Emma Wilson", "emma@example.com", { status: "customer" }),
  ];

  // Tags — relational catalogue + membership + history.
  const tags: Tag[] = [
    { id: "tag-vip", name: "VIP", color: "#f59e0b", archived_at: null, created_at: daysAgo(60), updated_at: daysAgo(60) },
    { id: "tag-lead", name: "Lead", color: "#3b82f6", archived_at: null, created_at: daysAgo(60), updated_at: daysAgo(60) },
    { id: "tag-newsletter", name: "Newsletter", color: "#10b981", archived_at: null, created_at: daysAgo(60), updated_at: daysAgo(60) },
    { id: "tag-refund", name: "Refund risk", color: "#ef4444", archived_at: null, created_at: daysAgo(60), updated_at: daysAgo(60) },
  ];
  const seedMembership: [string, string][] = [
    ["tag-vip", "cust-1"],
    ["tag-vip", "cust-5"],
    ["tag-newsletter", "cust-1"],
    ["tag-newsletter", "cust-3"],
    ["tag-lead", "cust-2"],
  ];
  const nameById = new Map(customers.map((c) => [c.id, c.name]));
  const tagNameById = new Map(tags.map((t) => [t.id, t.name]));
  const customerTags: CustomerTag[] = seedMembership.map(([tag_id, customer_id]) => ({
    customer_id,
    tag_id,
    assigned_by: "admin-1",
    assigned_at: daysAgo(45),
  }));
  let thSeq = 0;
  const tagHistory: TagHistory[] = seedMembership.map(([tag_id, customer_id]) => ({
    id: `th-${++thSeq}`,
    tag_id,
    customer_id,
    action: "added" as const,
    tag_name: tagNameById.get(tag_id) ?? "",
    customer_name: nameById.get(customer_id) ?? "",
    actor_id: "admin-1",
    created_at: daysAgo(45),
  }));

  const mkProduct = (
    id: string,
    name: string,
    description: string,
    price: number,
    billing: Product["billing_type"],
  ): Product => ({
    id,
    name,
    description,
    price,
    currency: "USD",
    billing_type: billing,
    hidden: false,
    archived_at: null,
    created_at: ts,
    updated_at: ts,
  });

  const products: Product[] = [
    mkProduct("prod-coaching", "1:1 Coaching Program", "Twelve-week private coaching engagement.", 1200, "one_time"),
    mkProduct("prod-course", "Signature Online Course", "Self-paced video course with worksheets.", 349, "one_time"),
    mkProduct("prod-membership", "Inner Circle Membership", "Monthly community + live calls.", 49, "subscription"),
    mkProduct("prod-ebook", "Starter eBook", "Entry-level digital download.", 19, "one_time"),
  ];

  let seq = 0;
  const mkPurchase = (customerId: string, productId: string, purchasedAt: string): Purchase => {
    const c = customers.find((x) => x.id === customerId)!;
    const p = products.find((x) => x.id === productId)!;
    seq += 1;
    return {
      id: `pur-${seq}`,
      purchase_ref: `P-${String(seq).padStart(6, "0")}`,
      customer_id: customerId,
      customer_name: c.name,
      product_id: productId,
      product_name: p.name,
      unit_amount: p.price,
      currency: p.currency,
      status: "paid",
      purchased_at: purchasedAt.slice(0, 10),
      billing_type: p.billing_type,
      period_start: null,
      period_end: null,
      sub_status: p.billing_type === "subscription" ? "active" : "none",
      canceled_at: null,
      external_ref: null,
      archived_at: null,
      created_at: nowISO(),
      updated_at: nowISO(),
    };
  };
  const purchases: Purchase[] = [
    mkPurchase("cust-1", "prod-coaching", daysAgo(40)),
    mkPurchase("cust-1", "prod-membership", daysAgo(38)),
    mkPurchase("cust-2", "prod-course", daysAgo(30)),
    mkPurchase("cust-3", "prod-course", daysAgo(22)),
    mkPurchase("cust-3", "prod-ebook", daysAgo(20)),
    mkPurchase("cust-4", "prod-ebook", daysAgo(12)),
    mkPurchase("cust-5", "prod-coaching", daysAgo(6)),
    mkPurchase("cust-5", "prod-membership", daysAgo(5)),
    mkPurchase("cust-2", "prod-ebook", daysAgo(2)),
  ];

  const calendars: Calendar[] = [
    {
      id: "cal-discovery",
      name: "Discovery Call",
      slug: "discovery-call",
      description: "Free 30-minute intro call.",
      price: 0,
      currency: "USD",
      paid: false,
      slot_minutes: 30,
      utc_offset_minutes: 0,
      timezone_label: "UTC",
      lead_time_minutes: 120,
      window_days: 14,
      weekly_hours: {
        1: [{ start: "09:00", end: "17:00" }],
        2: [{ start: "09:00", end: "17:00" }],
        3: [{ start: "09:00", end: "17:00" }],
        4: [{ start: "09:00", end: "17:00" }],
        5: [{ start: "09:00", end: "17:00" }],
      },
      busyness: { enabled: true, fraction: 0.35, epoch_days: 1 },
      archived_at: null,
      created_at: ts,
      updated_at: ts,
    },
    {
      id: "cal-strategy",
      name: "Strategy Session",
      slug: "strategy-session",
      description: "Paid 60-minute deep-dive.",
      price: 150,
      currency: "USD",
      paid: true,
      slot_minutes: 60,
      utc_offset_minutes: 0,
      timezone_label: "UTC",
      lead_time_minutes: 60,
      window_days: 21,
      weekly_hours: {
        2: [{ start: "10:00", end: "16:00" }],
        4: [{ start: "10:00", end: "16:00" }],
      },
      busyness: { enabled: false, fraction: 0, epoch_days: 0 },
      archived_at: null,
      created_at: ts,
      updated_at: ts,
    },
  ];
  const bookings: Booking[] = [];

  const integrations: IntegrationRow[] = [
    { provider: "google", connected: false, config: { calendar_id: "primary" }, connected_at: null, updated_at: ts },
    { provider: "stripe", connected: false, config: {}, connected_at: null, updated_at: ts },
    { provider: "leadconnector", connected: false, config: {}, connected_at: null, updated_at: ts },
  ];

  const forms: CrmForm[] = [
    {
      id: "form-lead",
      name: "Website Lead Capture",
      slug: "website-lead",
      token: "demo-token-lead-0001",
      fields: [
        { key: "name", label: "Full name", type: "text", required: true },
        { key: "email", label: "Email address", type: "email", required: true },
        { key: "message", label: "How can we help?", type: "textarea", required: false },
      ],
      mapping: {
        fields: {
          name: { kind: "customer_field", field: "name" },
          email: { kind: "customer_field", field: "email" },
          message: { kind: "customer_field", field: "notes" },
        },
        apply_tag_ids: ["tag-lead"],
      },
      create_customer: true,
      active: true,
      archived_at: null,
      created_at: ts,
      updated_at: ts,
    },
  ];

  const automations: Automation[] = [
    {
      id: "auto-welcome",
      name: "New Lead Welcome",
      description: "Welcome email → tag VIP → wait 1 day → follow-up email.",
      trigger: { kind: "form_submission", form_id: "form-lead" },
      steps: [
        { type: "email", subject: "Welcome, {{name}}!", body: "Hi {{name}},\n\nThanks for reaching out — we'll be in touch shortly.", from_name: "Lucy Coaching" },
        { type: "tag", tag_id: "tag-vip", action: "add" },
        { type: "wait", minutes: 1440 },
        { type: "email", subject: "Following up", body: "Hi {{name}}, just checking in. Ready to get started?", from_name: "Lucy Coaching" },
      ],
      active: true,
      archived_at: null,
      created_at: ts,
      updated_at: ts,
    },
  ];
  // A demo enrollment sitting at the final step and due now (so "Run now" shows
  // an in-progress sequence completing).
  const enrollments: AutomationEnrollment[] = [
    {
      id: "enr-demo-1",
      automation_id: "auto-welcome",
      customer_id: "cust-2",
      customer_name: "Liam Chen",
      customer_email: "liam@example.com",
      status: "active",
      current_step: 3,
      next_run_at: daysAgo(0),
      context: { name: "Liam Chen", email: "liam@example.com", custom: {} },
      created_at: daysAgo(1),
      updated_at: daysAgo(1),
    },
  ];
  const stepRuns: AutomationStepRun[] = [
    { id: "sr-1", enrollment_id: "enr-demo-1", step_index: 0, step_type: "email", detail: 'Demo email sent: "Welcome, Liam Chen!"', message_id: "demo-msg-seed", error: null, ran_at: daysAgo(1) },
    { id: "sr-2", enrollment_id: "enr-demo-1", step_index: 1, step_type: "tag", detail: "Tag added", message_id: null, error: null, ran_at: daysAgo(1) },
    { id: "sr-3", enrollment_id: "enr-demo-1", step_index: 2, step_type: "wait", detail: "Waiting 1440 min", message_id: null, error: null, ran_at: daysAgo(1) },
  ];

  const pipelineStages: PipelineStage[] = [
    { id: "stage-new", name: "New", position: 0, is_won: false, is_lost: false, created_at: ts },
    { id: "stage-qualified", name: "Qualified", position: 1, is_won: false, is_lost: false, created_at: ts },
    { id: "stage-won", name: "Won", position: 2, is_won: true, is_lost: false, created_at: ts },
    { id: "stage-lost", name: "Lost", position: 3, is_won: false, is_lost: true, created_at: ts },
  ];

  return {
    admins,
    customers,
    tags,
    customerTags,
    tagHistory,
    products,
    purchases,
    calendars,
    bookings,
    integrations,
    forms,
    submissions: [],
    automations,
    enrollments,
    stepRuns,
    notes: [],
    activities: [],
    emails: [],
    deals: [],
    pipelineStages,
    attachments: [],
    auditLogs: [],
    seq: { purchase: seq },
  };
}

const g = globalThis as unknown as { __lucyStore?: Store };

export function db(): Store {
  if (!g.__lucyStore) g.__lucyStore = seed();
  return g.__lucyStore;
}

export const now = nowISO;
export const currentDate = today;
