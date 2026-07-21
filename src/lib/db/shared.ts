import type { Customer, Tag, TagActivityKind } from "@/lib/types";

// Types shared by both repository backends (memory + supabase) and re-exported
// from the db index so call sites import them from one place.

export interface CustomerWithTags extends Customer {
  tags: Tag[];
}

// Filter for the tags activity log.
export interface TagActivityFilter {
  tagId?: string;
  customerId?: string; // rows whose who_ids contains this contact
  kind?: TagActivityKind;
}
