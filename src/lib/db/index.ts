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

export type { CustomerWithTags, TagActivityFilter } from "@/lib/db/shared";

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

// ---- Tags (one activity-log table) ----------------------------------------
export const listTagActivity = impl.listTagActivity;
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

// ---- Products -------------------------------------------------------------
export const listProducts = impl.listProducts;
export const getProduct = impl.getProduct;
export const createProduct = impl.createProduct;
export const updateProduct = impl.updateProduct;
export const archiveProduct = impl.archiveProduct;

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
