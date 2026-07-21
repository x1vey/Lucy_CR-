"use client";

import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";

// Browser Supabase client. Uses the anon key + the user's session cookie, so
// all access is constrained by RLS. Safe to use in Client Components.
export function createClient() {
  return createBrowserClient(env.supabaseUrl(), env.supabaseAnonKey());
}
