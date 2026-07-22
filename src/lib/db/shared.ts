import type {
  Customer,
  EnrollmentStatus,
  IntegrationProvider,
  Tag,
} from "@/lib/types";

// Types shared by both repository backends (memory + supabase) and re-exported
// from the db index so call sites import them from one place.

// Re-export the domain row types the store/backends work with so store.ts has a
// single import source.
export type {
  Activity,
  Admin,
  Attachment,
  Automation,
  AutomationEnrollment,
  AutomationStepRun,
  AuditLog,
  Booking,
  Calendar,
  CrmForm,
  Customer,
  Deal,
  EmailRecord,
  FormSubmission,
  Note,
  PipelineStage,
  Product,
  Purchase,
  Tag,
  TagHistory,
} from "@/lib/types";

// A contact with its current tags attached (derived from customer_tags).
export interface CustomerWithTags extends Customer {
  tags: Tag[];
}

// Current tag membership — a row of the customer_tags join table.
export interface CustomerTag {
  customer_id: string;
  tag_id: string;
  assigned_by: string | null;
  assigned_at: string;
}

// One provider's integration settings row (google | stripe | leadconnector).
export interface IntegrationRow {
  provider: IntegrationProvider;
  connected: boolean;
  config: Record<string, unknown>;
  connected_at: string | null;
  updated_at: string;
}

// Filter for the tag history audit trail.
export interface TagHistoryFilter {
  tagId?: string;
  customerId?: string;
  action?: "added" | "removed";
}

// Filter for automation enrollments.
export interface EnrollmentFilter {
  automationId?: string;
  customerId?: string;
  status?: EnrollmentStatus;
}
