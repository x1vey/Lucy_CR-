// Domain types shared across the app. These mirror the Supabase schema
// (see supabase/migrations). Kept hand-written & lean rather than generated so
// the app has a single readable source of truth; regenerate-and-replace later
// with `supabase gen types` if desired.

export type BillingType = "one_time" | "subscription";
export type PurchaseStatus = "unpaid" | "paid" | "refunded";
export type SubStatus = "active" | "trialing" | "past_due" | "canceled" | "none";

export type AdminRole = "owner" | "admin";

// A CRM operator who can log in. Not the same as a Customer (a contact/lead).
// `password_hash` never leaves the server — the AdminSafe view omits it.
export interface Admin {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: AdminRole;
  last_login_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

// Admin without the password hash — safe to pass to Client Components / return
// from list endpoints.
export type AdminSafe = Omit<Admin, "password_hash">;

// The five standard UTM query parameters, plus we treat them uniformly.
export const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;
export type UtmKey = (typeof UTM_KEYS)[number];
export type UtmParams = Partial<Record<UtmKey, string>>;

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  notes: string | null;
  custom_fields: Record<string, unknown>;
  utm: UtmParams; // first-touch attribution captured when the contact was created
  hidden: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Tags — ONE table, an activity log.
//
// There is no separate tags / customer_tags / tag_events split anymore. Every
// row in the `tags` table is an activity entry:
//   * kind = "created" — a tag was defined (who_* empty)
//   * kind = "added"   — the tag was applied to one or more contacts (the who)
//   * kind = "removed" — the tag was taken off one or more contacts
// `tag_id` threads all rows of the same tag together. `who_ids`/`who_names`
// hold the (possibly multiple) contacts an add/remove touched, with a name
// snapshot so history reads well after a contact is renamed.
//
// A tag's *current* membership is DERIVED: for each contact, the latest
// add/remove row that mentions them wins. Name/colour come from the "created"
// row (which `updateTag` edits in place). "Deleting" a tag soft-deletes its
// created row via archived_at.
// ---------------------------------------------------------------------------

export type TagActivityKind = "created" | "added" | "removed";

export interface TagActivity {
  id: string; // row id
  tag_id: string; // stable id shared by all rows of one tag
  kind: TagActivityKind;
  name: string; // snapshot
  color: string; // snapshot
  who_ids: string[]; // affected contact ids (empty for "created")
  who_names: string[]; // snapshot names, parallel to who_ids
  archived_at: string | null; // set on the "created" row when the tag is deleted
  created_at: string;
}

// Derived view of a tag (rolled up from its activity rows) — the shape the tag
// pickers, chips and counts consume. Not a table; produced by the repository.
export interface Tag {
  id: string; // = tag_id
  name: string;
  color: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  billing_type: BillingType;
  hidden: boolean;
  source_project_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Purchase {
  id: string;
  purchase_ref: string;
  customer_id: string;
  customer_name: string; // snapshot
  product_id: string | null;
  product_name: string; // snapshot
  unit_amount: number;
  currency: string;
  status: PurchaseStatus;
  purchased_at: string; // date
  billing_type: BillingType;
  period_start: string | null;
  period_end: string | null;
  sub_status: SubStatus;
  canceled_at: string | null;
  external_ref: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FormFieldDef {
  key: string;
  label: string;
  type: "text" | "email" | "number" | "textarea" | "checkbox";
  required: boolean;
}

export type FormMappingTarget =
  | { kind: "customer_field"; field: "name" | "email" | "notes" }
  | { kind: "custom_field"; key: string }
  | { kind: "ignore" };

export interface FormMapping {
  // form field key -> where its value goes on the customer
  fields: Record<string, FormMappingTarget>;
  // tag ids to apply to any customer created/matched by this form
  apply_tag_ids: string[];
}

export interface CrmForm {
  id: string;
  name: string;
  slug: string;
  token: string;
  fields: FormFieldDef[];
  mapping: FormMapping;
  create_customer: boolean;
  active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FormSubmission {
  id: string;
  form_id: string;
  payload: Record<string, unknown>;
  mapped: Record<string, unknown>;
  customer_id: string | null;
  source_ip: string | null;
  utm: UtmParams; // UTM params captured from the embedding page's URL
  status: string;
  created_at: string;
}
