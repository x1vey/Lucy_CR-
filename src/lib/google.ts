import "server-only";

import { env, isGoogleConfigured } from "@/lib/env";
import { getIntegrationSettings, updateIntegrationSettings } from "@/lib/db";
import type { Interval } from "@/lib/availability";

// ---------------------------------------------------------------------------
// Google Calendar integration — thin wrapper over the REST API using fetch
// (no heavy `googleapis` dependency). ONE global business account: the refresh
// token minted at "Connect" time lives in the integration settings row.
//
// DEMO FALLBACK: when Google isn't configured OR isn't connected yet, free/busy
// returns empty and event creation returns a fake id — so the whole booking
// flow works locally with no keys. Mirrors the Supabase/Stripe fallbacks.
// ---------------------------------------------------------------------------

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

/** Whether real Google calls can be made (configured AND a token stored). */
export async function isGoogleLive(): Promise<boolean> {
  if (!isGoogleConfigured()) return false;
  const settings = await getIntegrationSettings();
  return settings.google.connected && !!settings.google.refresh_token;
}

/** Build the OAuth consent URL. `state` guards against CSRF (signed upstream). */
export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.googleClientId(),
    redirect_uri: env.googleRedirectUri(),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent", // force a refresh token on every (re)connect
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

/** Exchange an OAuth code for tokens (used by the callback route). */
export async function exchangeCode(code: string): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.googleClientId(),
      client_secret: env.googleClientSecret(),
      redirect_uri: env.googleRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${await res.text()}`);
  return (await res.json()) as TokenResponse;
}

/** Look up the connected account's email (for display / auditing). */
export async function fetchUserEmail(accessToken: string): Promise<string | null> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { email?: string };
  return data.email ?? null;
}

// Cache the short-lived access token in-process to avoid a refresh per request.
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  const settings = await getIntegrationSettings();
  const refresh = settings.google.refresh_token;
  if (!refresh) return null;
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 30_000) {
    return cachedAccessToken.token;
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.googleClientId(),
      client_secret: env.googleClientSecret(),
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed: ${await res.text()}`);
  const data = (await res.json()) as TokenResponse;
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

/**
 * Busy intervals from the connected calendar between two ISO instants. Returns
 * [] in demo mode so availability is driven purely by config + local bookings.
 */
export async function freeBusy(
  timeMin: string,
  timeMax: string,
): Promise<Interval[]> {
  if (!(await isGoogleLive())) return [];
  const token = await getAccessToken();
  if (!token) return [];
  const settings = await getIntegrationSettings();
  const calendarId = settings.google.calendar_id || "primary";
  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ timeMin, timeMax, items: [{ id: calendarId }] }),
  });
  if (!res.ok) {
    // Fail open: a Google outage shouldn't take the booking page down. Worst
    // case a double-book is still blocked by the local bookings check.
    return [];
  }
  const data = (await res.json()) as {
    calendars?: Record<string, { busy?: Interval[] }>;
  };
  return data.calendars?.[calendarId]?.busy ?? [];
}

/**
 * Create a calendar event for a confirmed booking. In demo mode returns a fake
 * id so the caller can still record "an event was created".
 */
export async function insertEvent(input: {
  summary: string;
  description?: string;
  start: string; // ISO UTC
  end: string; // ISO UTC
  attendeeEmail?: string;
  attendeeName?: string;
}): Promise<string> {
  if (!(await isGoogleLive())) {
    return `demo-evt-${Math.random().toString(36).slice(2, 12)}`;
  }
  const token = await getAccessToken();
  if (!token) return `demo-evt-${Math.random().toString(36).slice(2, 12)}`;
  const settings = await getIntegrationSettings();
  const calendarId = settings.google.calendar_id || "primary";
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendarId,
    )}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: input.summary,
        description: input.description,
        start: { dateTime: input.start },
        end: { dateTime: input.end },
        attendees: input.attendeeEmail
          ? [{ email: input.attendeeEmail, displayName: input.attendeeName }]
          : undefined,
      }),
    },
  );
  if (!res.ok) throw new Error(`Google event insert failed: ${await res.text()}`);
  const data = (await res.json()) as { id: string };
  return data.id;
}

/** Persist a freshly-minted refresh token + connected email. */
export async function storeGoogleConnection(input: {
  refreshToken: string;
  email: string | null;
}): Promise<void> {
  await updateIntegrationSettings({
    google: {
      connected: true,
      refresh_token: input.refreshToken,
      calendar_id: "primary",
      connected_email: input.email,
      connected_at: new Date().toISOString(),
    },
  });
  cachedAccessToken = null;
}

export async function disconnectGoogle(): Promise<void> {
  await updateIntegrationSettings({
    google: {
      connected: false,
      refresh_token: null,
      calendar_id: "primary",
      connected_email: null,
      connected_at: null,
    },
  });
  cachedAccessToken = null;
}
