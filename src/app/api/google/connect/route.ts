import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { buildAuthUrl } from "@/lib/google";
import { env, isGoogleConfigured } from "@/lib/env";
import { requireAdmin } from "@/lib/auth";

// Kick off Google OAuth. Admin-guarded. Redirects to Google's consent screen
// with a signed `state` value the callback verifies (CSRF protection).
export const dynamic = "force-dynamic";

export async function GET() {
  await requireAdmin();
  if (!isGoogleConfigured()) {
    return NextResponse.redirect(
      `${env.appUrl()}/settings/integrations?error=google_not_configured`,
    );
  }
  // state = "<nonce>.<hmac>" — the callback recomputes the hmac to confirm the
  // request originated here.
  const nonce = `${Date.now()}`;
  const sig = createHmac("sha256", env.sessionSecret()).update(nonce).digest("hex");
  const state = `${nonce}.${sig}`;
  return NextResponse.redirect(buildAuthUrl(state));
}
