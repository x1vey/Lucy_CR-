// Domain types shared across the app. These mirror the Postgres schema
// (supabase/schema.sql + supabase/migrations). Hand-written & lean so the app
// has one readable source of truth.
//
// v2 (database redesign): tags are relational (catalogue + membership + history),
// calendars and bookings are their own tables (out of products), integration
// settings are per-provider rows, and the customer record is a fuller CRM
// contact. See DB_REDESIGN.md for the reasoning.

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

// ---------------------------------------------------------------------------
// Customer (contact) — the fuller CRM record. lead_source/owner/status make it
// a real pipeline contact; merged_into/duplicate_of support dedup; first- and
// latest-touch UTM are tracked separately.
// ---------------------------------------------------------------------------
export type CustomerStatus =
  | "lead"
  | "active"
  | "customer"
  | "churned"
  | "archived";

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  status: CustomerStatus;
  lead_source: string | null;
  owner_id: string | null; // → admins.id
  created_by: string | null; // → admins.id
  notes: string | null; // headline note; long notes live in `notes` table
  custom_fields: Record<string, unknown>;
  utm_first_touch: UtmParams; // immutable first-touch attribution
  utm_latest_touch: UtmParams; // updated on later touches
  last_contacted_at: string | null;
  merged_into: string | null; // this row was merged INTO another customer
  duplicate_of: string | null; // flagged as a likely duplicate of another
  hidden: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Tags — relational: a catalogue (`tags`), current membership (`customer_tags`,
// a join), and a separate append-only audit trail (`tag_history`). Membership is
// directly queryable; history is NOT the source of truth.
// ---------------------------------------------------------------------------
export interface Tag {
  id: string;
  name: string;
  color: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export type TagHistoryAction = "added" | "removed";

export interface TagHistory {
  id: string;
  tag_id: string | null;
  customer_id: string | null;
  action: TagHistoryAction;
  tag_name: string; // snapshot
  customer_name: string; // snapshot
  actor_id: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Products — plain sellables only (calendars/integrations are their own tables).
// ---------------------------------------------------------------------------
export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  billing_type: BillingType;
  hidden: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Booking calendars — now their own table. Config (weekly hours, slot length,
// scarcity, timezone offset) lives on the calendar row; bookings are separate
// relational rows (see Booking).
// ---------------------------------------------------------------------------

// Per-weekday open windows in the calendar's local wall-clock time. Keyed by
// day-of-week 0=Sunday .. 6=Saturday. Each window is a { start, end } pair of
// "HH:MM" 24h strings. A day with no windows is closed.
export interface OpenWindow {
  start: string; // "09:00"
  end: string; // "17:00"
}
export type WeeklyHours = Record<number, OpenWindow[]>;

export interface Busyness {
  enabled: boolean; // hide a fraction of open slots to signal scarcity
  fraction: number; // 0..1 — portion of otherwise-open slots to mark busy
  epoch_days: number; // re-roll window in days (0 = never re-roll)
}

export interface Calendar {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  currency: string;
  paid: boolean; // false = book immediately; true = Stripe checkout first
  slot_minutes: number; // slot length: 15 | 30 | 60
  // Wall-clock hours are interpreted at this fixed UTC offset (minutes east of
  // UTC). A plain numeric offset keeps slot math dependency-free. DST untracked.
  utc_offset_minutes: number;
  timezone_label: string; // e.g. "GMT-05:00"
  lead_time_minutes: number; // earliest bookable offset from "now"
  window_days: number; // how far into the future bookings are allowed
  weekly_hours: WeeklyHours;
  busyness: Busyness;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export type BookingStatus = "pending" | "confirmed" | "canceled";

export interface Booking {
  id: string;
  calendar_id: string;
  customer_id: string | null; // linked CRM contact
  status: BookingStatus;
  starts_at: string; // ISO UTC instant
  ends_at: string; // ISO UTC instant
  attendee_name: string;
  attendee_email: string;
  notes: string | null;
  google_event_id: string | null;
  stripe_session_id: string | null;
  hold_expires_at: string | null; // pending holds expire (paid flow)
  amount: number | null;
  currency: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Integration settings — one row per provider in the DB. The repository still
// exposes the aggregate shape below so call sites read settings.google /
// settings.stripe unchanged. Env holds static keys; runtime-issued secrets
// (Google refresh token) live in the provider row. Never send to the client.
// ---------------------------------------------------------------------------

export interface GoogleIntegration {
  connected: boolean;
  refresh_token: string | null;
  calendar_id: string; // usually "primary"
  connected_email: string | null;
  connected_at: string | null;
}

export interface StripeIntegration {
  account_label: string | null; // cosmetic; keys come from env
}

export interface IntegrationSettings {
  google: GoogleIntegration;
  stripe: StripeIntegration;
}

export type IntegrationProvider = "google" | "stripe" | "leadconnector";

// ---------------------------------------------------------------------------
// Purchases — sales ledger (snapshots kept).
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Forms — definitions kept as JSON (see DB_REDESIGN.md).
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Notes — long-form per-contact notes.
// ---------------------------------------------------------------------------
export interface Note {
  id: string;
  customer_id: string;
  body: string;
  created_by: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Activities — the customer-facing timeline. payload shape varies by type.
// ---------------------------------------------------------------------------
export type ActivityType =
  | "email_sent"
  | "email_opened"
  | "email_clicked"
  | "purchase"
  | "booking"
  | "form_submitted"
  | "tag_added"
  | "tag_removed"
  | "note"
  | "imported"
  | "stage_changed"
  | "deal_created"
  | "deal_won"
  | "deal_lost"
  | "manual";

export interface Activity {
  id: string;
  customer_id: string;
  type: ActivityType;
  payload: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Emails — outbound email history.
// ---------------------------------------------------------------------------
export type EmailStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "failed";

export interface EmailRecord {
  id: string;
  customer_id: string | null;
  provider_id: string | null;
  subject: string;
  body: string | null;
  status: EmailStatus;
  sent_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Deals / pipeline.
// ---------------------------------------------------------------------------
export interface PipelineStage {
  id: string;
  name: string;
  position: number;
  is_won: boolean;
  is_lost: boolean;
  created_at: string;
}

export type DealStatus = "open" | "won" | "lost";

export interface Deal {
  id: string;
  customer_id: string;
  title: string;
  stage_id: string | null;
  value: number;
  currency: string;
  probability: number; // 0..100
  expected_close_date: string | null;
  owner_id: string | null;
  status: DealStatus;
  closed_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Attachments — files linked to a contact.
// ---------------------------------------------------------------------------
export interface Attachment {
  id: string;
  customer_id: string;
  filename: string;
  mime_type: string | null;
  size: number | null;
  url: string;
  uploaded_by: string | null;
  uploaded_at: string;
}

// ---------------------------------------------------------------------------
// Audit logs — SYSTEM audit (who changed what config/admin), distinct from the
// customer-facing `activities` timeline. Append-only.
// ---------------------------------------------------------------------------
export interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string; // e.g. "product.update", "google.connect"
  entity_type: string | null;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Email automations — definitions JSON, runtime relational. The per-step log is
// now its own table (AutomationStepRun) instead of a JSON array on the
// enrollment.
// ---------------------------------------------------------------------------

export type AutomationTriggerKind = "form_submission" | "tag_added" | "manual";

export interface AutomationTrigger {
  kind: AutomationTriggerKind;
  form_id?: string | null; // for form_submission
  tag_id?: string | null; // for tag_added
}

// Steps are a discriminated union so the builder can render the right editor.
export interface EmailStep {
  type: "email";
  subject: string;
  body: string; // supports {{name}} / {{email}} / {{custom.<key>}} merge fields
  from_name?: string | null;
}
export interface TagStep {
  type: "tag";
  tag_id: string;
  action: "add" | "remove";
}
export interface WaitStep {
  type: "wait";
  minutes: number;
}
export type AutomationStep = EmailStep | TagStep | WaitStep;

export interface Automation {
  id: string;
  name: string;
  description: string | null;
  trigger: AutomationTrigger;
  steps: AutomationStep[];
  active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export type EnrollmentStatus = "active" | "completed" | "canceled" | "failed";

export interface AutomationEnrollment {
  id: string;
  automation_id: string;
  customer_id: string;
  customer_name: string; // snapshot for readable history
  customer_email: string | null; // snapshot
  status: EnrollmentStatus;
  current_step: number; // index of the NEXT step to run
  next_run_at: string | null; // when the runner should next touch this (null = done)
  context: Record<string, unknown>; // merge-field snapshot at enrollment time
  created_at: string;
  updated_at: string;
}

// One row per executed step (was a JSON `history` array on the enrollment).
export interface AutomationStepRun {
  id: string;
  enrollment_id: string;
  step_index: number;
  step_type: AutomationStep["type"];
  detail: string;
  message_id: string | null;
  error: string | null;
  ran_at: string;
}
