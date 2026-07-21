import "server-only";

import { DEMO_ADMIN_HASH } from "@/lib/password";
import type {
  Admin,
  CrmForm,
  Customer,
  FormSubmission,
  Product,
  Purchase,
  TagActivity,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// In-memory data store.
//
// Supabase is intentionally deferred (see project brief). This module is the
// single stand-in for the database: a set of plain arrays seeded with demo
// data. All repository functions in `src/lib/db/index.ts` read/write here.
//
// It's attached to `globalThis` so state survives Next.js hot-reloads in dev.
// Obviously this is per-process and non-durable — swapping it for the Supabase
// clients (already scaffolded under src/lib/supabase) is the eventual step.
// ---------------------------------------------------------------------------

export interface Store {
  admins: Admin[];
  customers: Customer[];
  // The one tags table: an append-mostly activity log. Membership + the tag
  // catalogue are derived from these rows (see src/lib/db/*.ts).
  tagActivity: TagActivity[];
  products: Product[];
  purchases: Purchase[];
  forms: CrmForm[];
  submissions: FormSubmission[];
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
  return d.toISOString().slice(0, 10);
}

function seed(): Store {
  const ts = nowISO();

  // One seeded admin so you can log in immediately in demo mode.
  // Email: admin@lucy.crm   Password: admin1234
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

  // Tag identities (a tag = a tag_id shared across its activity rows).
  const tagDefs = [
    { tag_id: "tag-vip", name: "VIP", color: "#f59e0b" },
    { tag_id: "tag-lead", name: "Lead", color: "#3b82f6" },
    { tag_id: "tag-newsletter", name: "Newsletter", color: "#10b981" },
    { tag_id: "tag-refund", name: "Refund risk", color: "#ef4444" },
  ];

  const products: Product[] = [
    {
      id: "prod-coaching",
      name: "1:1 Coaching Program",
      description: "Twelve-week private coaching engagement.",
      price: 1200,
      currency: "USD",
      billing_type: "one_time",
      hidden: false,
      source_project_id: null,
      archived_at: null,
      created_at: ts,
      updated_at: ts,
    },
    {
      id: "prod-course",
      name: "Signature Online Course",
      description: "Self-paced video course with worksheets.",
      price: 349,
      currency: "USD",
      billing_type: "one_time",
      hidden: false,
      source_project_id: null,
      archived_at: null,
      created_at: ts,
      updated_at: ts,
    },
    {
      id: "prod-membership",
      name: "Inner Circle Membership",
      description: "Monthly community + live calls.",
      price: 49,
      currency: "USD",
      billing_type: "subscription",
      hidden: false,
      source_project_id: null,
      archived_at: null,
      created_at: ts,
      updated_at: ts,
    },
    {
      id: "prod-ebook",
      name: "Starter eBook",
      description: "Entry-level digital download.",
      price: 19,
      currency: "USD",
      billing_type: "one_time",
      hidden: false,
      source_project_id: null,
      archived_at: null,
      created_at: ts,
      updated_at: ts,
    },
  ];

  const customers: Customer[] = [
    mkCustomer("cust-1", "Ava Thompson", "ava@example.com", ts),
    mkCustomer("cust-2", "Liam Chen", "liam@example.com", ts),
    mkCustomer("cust-3", "Sofia Ramirez", "sofia@example.com", ts),
    mkCustomer("cust-4", "Noah Patel", "noah@example.com", ts),
    mkCustomer("cust-5", "Emma Wilson", "emma@example.com", ts),
  ];

  // Which contacts each tag was applied to (grouped so one "added" row can
  // carry multiple contacts — that's the multi-`who` behaviour).
  const seedMemberships: Record<string, string[]> = {
    "tag-vip": ["cust-1", "cust-5"],
    "tag-newsletter": ["cust-1", "cust-3"],
    "tag-lead": ["cust-2"],
  };

  // Build the one tags activity log: a "created" row per tag, then one "added"
  // row per tag that had members (each listing all its contacts as the who).
  let tagSeq = 0;
  const mkActivity = (
    kind: TagActivity["kind"],
    def: { tag_id: string; name: string; color: string },
    whoIds: string[],
    createdAt: string,
  ): TagActivity => {
    tagSeq += 1;
    return {
      id: `tact-${tagSeq}`,
      tag_id: def.tag_id,
      kind,
      name: def.name,
      color: def.color,
      who_ids: whoIds,
      who_names: whoIds.map(
        (id) => customers.find((c) => c.id === id)?.name ?? "",
      ),
      archived_at: null,
      created_at: createdAt,
    };
  };

  const tagActivity: TagActivity[] = [];
  for (const def of tagDefs) {
    tagActivity.push(mkActivity("created", def, [], daysAgo(60)));
  }
  for (const def of tagDefs) {
    const members = seedMemberships[def.tag_id];
    if (members?.length) {
      tagActivity.push(mkActivity("added", def, members, daysAgo(45)));
    }
  }

  let seq = 0;
  const mkPurchase = (
    customerId: string,
    productId: string,
    purchasedAt: string,
  ): Purchase => {
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
      purchased_at: purchasedAt,
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

  return {
    admins,
    customers,
    tagActivity,
    products,
    purchases,
    forms,
    submissions: [],
    seq: { purchase: seq },
  };
}

function mkCustomer(
  id: string,
  name: string,
  email: string,
  ts: string,
): Customer {
  return {
    id,
    name,
    email,
    notes: null,
    custom_fields: {},
    utm: {},
    hidden: false,
    archived_at: null,
    created_at: ts,
    updated_at: ts,
  };
}

const g = globalThis as unknown as { __lucyStore?: Store };

export function db(): Store {
  if (!g.__lucyStore) {
    g.__lucyStore = seed();
  }
  return g.__lucyStore;
}

export const now = nowISO;
export const currentDate = today;
