import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import {
  exchangeCode,
  fetchUserEmail,
  storeGoogleConnection,
} from "@/lib/google";
import { env } from "@/lib/env";
import { requireAdmin } from "@/lib/auth";

// Google redirects here after consent. Verifies the signed `state`, exchanges
// the code for tokens, and stores the refresh token in the integration row.
export const dynamic = "force-dynamic";

function validState(state: string | null): boolean {
  if (!state) return false;
  const idx = state.lastIndexOf(".");
  if (idx <= 0) return false;
  const nonce = state.slice(0, idx);
  const sig = state.slice(idx + 1);
  const expected = createHmac("sha256", env.sessionSecret())
    .update(nonce)
    .digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  await requireAdmin();
  const url = new URL(req.url);
  const settingsUrl = `${env.appUrl()}/settings/integrations`;

  const error = url.searchParams.get("error");
  if (error) {
    return NextResponse.redirect(`${settingsUrl}?error=${encodeURIComponent(error)}`);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !validState(state)) {
    return NextResponse.redirect(`${settingsUrl}?error=invalid_state`);
  }

  try {
    const tokens = await exchangeCode(code);
    if (!tokens.refresh_token) {
      // Google only returns a refresh token with prompt=consent; if missing,
      // the user likely re-consented without it — ask them to try again.
      return NextResponse.redirect(`${settingsUrl}?error=no_refresh_token`);
    }
    const email = await fetchUserEmail(tokens.access_token);
    await storeGoogleConnection({ refreshToken: tokens.refresh_token, email });
    return NextResponse.redirect(`${settingsUrl}?connected=1`);
  } catch {
    return NextResponse.redirect(`${settingsUrl}?error=exchange_failed`);
  }
}
