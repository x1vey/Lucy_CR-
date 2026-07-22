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

  // ---- Google Calendar OAuth (client credentials are static; the refresh
  // token minted at "Connect" time is stored in the integration row instead) ----
  googleClientId: () => required("GOOGLE_CLIENT_ID"),
  googleClientSecret: () => required("GOOGLE_CLIENT_SECRET"),
  // Where Google redirects back after consent. Defaults to <appUrl>/api/google/callback.
  googleRedirectUri: () =>
    process.env.GOOGLE_REDIRECT_URI ??
    `${(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/api/google/callback`,

  // ---- Stripe (payment only) ----
  stripeSecretKey: () => required("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: () => required("STRIPE_WEBHOOK_SECRET"),
  stripePublishableKey: () =>
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "",

  // ---- LeadConnector / GoHighLevel (email send transport) ----
  leadConnectorApiKey: () => required("LEADCONNECTOR_API_KEY"),
  leadConnectorLocationId: () => process.env.LEADCONNECTOR_LOCATION_ID ?? "",
  // Sensible LeadConnector v2 defaults so the common setup works with no extra
  // config; overridable to match a specific account / API version.
  leadConnectorBaseUrl: () =>
    (process.env.LEADCONNECTOR_BASE_URL ?? "https://services.leadconnectorhq.com").replace(
      /\/$/,
      "",
    ),
  leadConnectorApiVersion: () =>
    process.env.LEADCONNECTOR_API_VERSION ?? "2021-07-28",
  // Path (relative to base URL) that sends an email. Default is the v2
  // conversations/messages endpoint.
  leadConnectorEmailEndpoint: () =>
    process.env.LEADCONNECTOR_EMAIL_ENDPOINT ?? "/conversations/messages",

  // Shared secret the automation tick endpoint requires (so only your cron can
  // advance sequences). Falls back to a dev value for local runs.
  automationsCronSecret: () =>
    process.env.AUTOMATIONS_CRON_SECRET &&
    process.env.AUTOMATIONS_CRON_SECRET.length >= 8
      ? process.env.AUTOMATIONS_CRON_SECRET
      : "lucy-crm-dev-cron-secret",
};

// Reject the placeholder values shipped in .env.example.
function looksReal(v: string): boolean {
  return v.length > 0 && !/placeholder|your-|YOUR-|example/.test(v);
}

// True when real Google OAuth credentials are present. When false, the calendar
// feature runs in demo mode: free/busy is empty and events are mocked. Mirrors
// isSupabaseConfigured() so each integration falls back independently.
export function isGoogleConfigured(): boolean {
  return (
    looksReal(process.env.GOOGLE_CLIENT_ID ?? "") &&
    looksReal(process.env.GOOGLE_CLIENT_SECRET ?? "")
  );
}

// True when real Stripe credentials are present. When false, paid bookings use
// an internal demo confirm page instead of a real Checkout Session.
export function isStripeConfigured(): boolean {
  return looksReal(process.env.STRIPE_SECRET_KEY ?? "");
}

// True when a real LeadConnector API key is present. When false, automation
// email steps are logged as demo sends (the sequence still runs end-to-end).
export function isLeadConnectorConfigured(): boolean {
  return looksReal(process.env.LEADCONNECTOR_API_KEY ?? "");
}

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
