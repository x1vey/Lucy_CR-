import "server-only";

import { isSupabaseConfigured } from "@/lib/env";
import * as memory from "@/lib/db/memory";
import * as supabase from "@/lib/db/supabase";

// ---------------------------------------------------------------------------
// Repository dispatcher.
//
// Every read/write in the app goes through here. It selects a backend once, at
// module load, based on whether real Supabase credentials are present:
//   * configured   → live Postgres (src/lib/db/supabase.ts)
//   * not configured → in-memory demo store (src/lib/db/memory.ts)
//
// Both backends expose the identical async surface, so call sites don't care
// which is active. This lets the app run today on the demo store and flip to
// the real database the moment .env has valid keys — no code change.
// ---------------------------------------------------------------------------

const impl = isSupabaseConfigured() ? supabase : memory;

/** Which backend is active — surfaced in the UI (e.g. the sidebar badge). */
export const activeBackend: "supabase" | "memory" = isSupabaseConfigured()
  ? "supabase"
  : "memory";

export type {
  CustomerWithTags,
  EnrollmentFilter,
  TagHistoryFilter,
} from "@/lib/db/shared";
export type { CalendarInput } from "@/lib/db/memory";

// ---- Admins ---------------------------------------------------------------
export const listAdmins = impl.listAdmins;
export const getAdmin = impl.getAdmin;
export const getAdminByEmailWithHash = impl.getAdminByEmailWithHash;
export const createAdmin = impl.createAdmin;
export const updateAdmin = impl.updateAdmin;
export const archiveAdmin = impl.archiveAdmin;
export const setAdminLastLogin = impl.setAdminLastLogin;
export const liveAdminCount = impl.liveAdminCount;

// ---- Customers ------------------------------------------------------------
export const listCustomers = impl.listCustomers;
export const getCustomer = impl.getCustomer;
export const createCustomer = impl.createCustomer;
export const updateCustomer = impl.updateCustomer;
export const archiveCustomer = impl.archiveCustomer;
export const upsertCustomerByEmail = impl.upsertCustomerByEmail;
export const setCustomerUtm = impl.setCustomerUtm;

// ---- Tags (relational: catalogue + membership + history) -------------------
export const listTagHistory = impl.listTagHistory;
export const listTags = impl.listTags;
export const tagsForCustomer = impl.tagsForCustomer;
export const createTag = impl.createTag;
export const updateTag = impl.updateTag;
export const archiveTag = impl.archiveTag;
export const setCustomerTags = impl.setCustomerTags;
export const tagUsageCounts = impl.tagUsageCounts;
export const setCustomerTag = impl.setCustomerTag;
export const applyTags = impl.applyTags;
export const addTagToCustomers = impl.addTagToCustomers;

// ---- Products (plain sellables) --------------------------------------------
export const listProducts = impl.listProducts;
export const getProduct = impl.getProduct;
export const createProduct = impl.createProduct;
export const updateProduct = impl.updateProduct;
export const archiveProduct = impl.archiveProduct;

// ---- Calendars + Bookings (relational) -------------------------------------
export const listCalendars = impl.listCalendars;
export const getCalendar = impl.getCalendar;
export const getCalendarBySlug = impl.getCalendarBySlug;
export const createCalendar = impl.createCalendar;
export const updateCalendar = impl.updateCalendar;
export const archiveCalendar = impl.archiveCalendar;
export const listBookings = impl.listBookings;
export const getBooking = impl.getBooking;
export const bookSlot = impl.bookSlot;
export const updateBooking = impl.updateBooking;
export const findBookingByStripeSession = impl.findBookingByStripeSession;

// ---- Integration settings (per-provider rows) ------------------------------
export const getIntegrationSettings = impl.getIntegrationSettings;
export const updateIntegrationSettings = impl.updateIntegrationSettings;

// ---- Purchases ------------------------------------------------------------
export const listPurchases = impl.listPurchases;
export const listPurchasesForCustomer = impl.listPurchasesForCustomer;
export const listPurchasesForProduct = impl.listPurchasesForProduct;
export const recordPurchase = impl.recordPurchase;
export const archivePurchase = impl.archivePurchase;
export const currentProductsFor = impl.currentProductsFor;

// ---- Forms ----------------------------------------------------------------
export const listForms = impl.listForms;
export const getForm = impl.getForm;
export const getFormByToken = impl.getFormByToken;
export const getFormBySlug = impl.getFormBySlug;
export const createForm = impl.createForm;
export const updateForm = impl.updateForm;
export const archiveForm = impl.archiveForm;

// ---- Submissions ----------------------------------------------------------
export const listSubmissions = impl.listSubmissions;
export const recordSubmission = impl.recordSubmission;

// ---- Automations ----------------------------------------------------------
export const listAutomations = impl.listAutomations;
export const getAutomation = impl.getAutomation;
export const createAutomation = impl.createAutomation;
export const updateAutomation = impl.updateAutomation;
export const archiveAutomation = impl.archiveAutomation;

// ---- Automation enrollments + step runs ------------------------------------
export const listEnrollments = impl.listEnrollments;
export const getEnrollment = impl.getEnrollment;
export const enrollContact = impl.enrollContact;
export const updateEnrollment = impl.updateEnrollment;
export const cancelEnrollment = impl.cancelEnrollment;
export const claimDueEnrollments = impl.claimDueEnrollments;
export const recordStepRun = impl.recordStepRun;
export const listStepRuns = impl.listStepRuns;

// ---- Notes ----------------------------------------------------------------
export const listNotes = impl.listNotes;
export const createNote = impl.createNote;
export const archiveNote = impl.archiveNote;

// ---- Activities (customer timeline) ----------------------------------------
export const listActivities = impl.listActivities;
export const recordActivity = impl.recordActivity;

// ---- Emails ---------------------------------------------------------------
export const listEmails = impl.listEmails;
export const recordEmail = impl.recordEmail;

// ---- Deals + pipeline ------------------------------------------------------
export const listPipelineStages = impl.listPipelineStages;
export const listDeals = impl.listDeals;
export const createDeal = impl.createDeal;
export const updateDeal = impl.updateDeal;
export const archiveDeal = impl.archiveDeal;

// ---- Attachments -----------------------------------------------------------
export const listAttachments = impl.listAttachments;
export const createAttachment = impl.createAttachment;
export const archiveAttachment = impl.archiveAttachment;

// ---- Audit logs (system) ---------------------------------------------------
export const listAuditLogs = impl.listAuditLogs;
export const recordAuditLog = impl.recordAuditLog;
