import "server-only";

import { createClient as createServiceClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

// Service-role Supabase client. BYPASSES RLS entirely — never expose to the
// browser (the `server-only` import guards against accidental client bundling).
//
// Only legitimate use here: the public form-ingest route, which is anonymous by
// design and must write submissions without a user session. All access through
// this client MUST enforce its own authorization (e.g. validating a form token).
export function createAdminClient() {
  return createServiceClient(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
