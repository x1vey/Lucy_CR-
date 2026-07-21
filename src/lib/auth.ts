import "server-only";

import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { getAdmin } from "@/lib/db";
import type { AdminSafe } from "@/lib/types";

// ---------------------------------------------------------------------------
// Lightweight admin auth: an HMAC-signed session cookie carrying the admin id.
//
// Not Supabase Auth — this app has its own tiny `admins` table (see the
// repository). The cookie value is `<adminId>.<sig>` where sig = HMAC-SHA256 of
// the id under SESSION_SECRET. A tampered id fails verification. httpOnly so
// client JS can't read it. Session lifetime is the cookie maxAge.
// ---------------------------------------------------------------------------

const COOKIE = "lucy_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function sign(id: string): string {
  return createHmac("sha256", env.sessionSecret()).update(id).digest("hex");
}

function makeToken(id: string): string {
  return `${id}.${sign(id)}`;
}

function parseToken(token: string | undefined): string | null {
  if (!token) return null;
  const idx = token.lastIndexOf(".");
  if (idx <= 0) return null;
  const id = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = sign(id);
  // Constant-time compare to avoid signature-guessing via timing.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return id;
}

/** Write the session cookie for a just-authenticated admin. */
export async function createSession(adminId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, makeToken(adminId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

/** The logged-in admin (validated against the DB), or null. */
export async function getCurrentAdmin(): Promise<AdminSafe | null> {
  const store = await cookies();
  const id = parseToken(store.get(COOKIE)?.value);
  if (!id) return null;
  // Confirm the admin still exists and isn't archived.
  return (await getAdmin(id)) ?? null;
}

/** Page/action guard: redirect to /login if not authenticated. */
export async function requireAdmin(): Promise<AdminSafe> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");
  return admin;
}

/** Just the cookie name — used by middleware for a cheap presence check. */
export const SESSION_COOKIE = COOKIE;
