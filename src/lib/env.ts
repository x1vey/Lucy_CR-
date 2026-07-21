// Centralized env access with clear errors. Import from here rather than
// reading process.env inline so misconfiguration fails loudly and early.

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example.`,
    );
  }
  return v;
}

export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  // Server-only. Never import this into a Client Component.
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  appUrl: () =>
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "http://localhost:3000",
  // Secret used to HMAC-sign the session cookie. Falls back to a fixed dev
  // value so the app runs out of the box; MUST be set to a strong random value
  // in production (sessions signed with the dev secret are trivially forgeable).
  sessionSecret: () =>
    process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16
      ? process.env.SESSION_SECRET
      : "lucy-crm-dev-session-secret-change-me",
};

// True when real Supabase credentials are present (both the URL/anon key for
// clients and the service-role key the server repository uses). When false, the
// app runs on the in-memory demo store. The placeholders in .env.example don't
// count — we check for a real-looking https URL and non-placeholder keys.
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const looksReal = (v: string) =>
    v.length > 0 && !/placeholder|your-|YOUR-|example/.test(v);
  return (
    /^https:\/\/.+\.supabase\.co/.test(url) &&
    looksReal(anon) &&
    looksReal(service)
  );
}
