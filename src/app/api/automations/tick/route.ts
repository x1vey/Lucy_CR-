import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { runDueEnrollments } from "@/lib/automations/runner";
import { env } from "@/lib/env";

// Automation runner endpoint — advances every due enrollment one tick.
//
// Wire this to a scheduler in production (e.g. Vercel Cron hitting it every
// minute) with the AUTOMATIONS_CRON_SECRET in the Authorization header. In demo
// mode the "Run now" button on the Automations screen calls the same runner via
// a server action, so no external scheduler is required to try it.
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = env.automationsCronSecret();
  // Accept "Authorization: Bearer <secret>" or "?secret=<secret>".
  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ")
    ? header.slice(7)
    : new URL(req.url).searchParams.get("secret") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const summary = await runDueEnrollments();
  return NextResponse.json({ ok: true, ...summary });
}

export async function POST(req: NextRequest) {
  return handle(req);
}

// Vercel Cron issues GET requests, so support both.
export async function GET(req: NextRequest) {
  return handle(req);
}
