import { NextRequest, NextResponse } from "next/server";
import {
  bookSlot,
  getCalendarBySlug,
  listBookings,
  updateBooking,
  upsertCustomerByEmail,
} from "@/lib/db";
import { freeBusy } from "@/lib/google";
import { createCheckoutSession } from "@/lib/stripe";
import { confirmBooking } from "@/lib/booking";
import { isSlotBookable } from "@/lib/availability";
import { env } from "@/lib/env";

// Public booking endpoint. Anonymous by design — the calendar slug in the URL
// is the capability (same model as the form ingest route). CORS is open so a
// booking widget can be embedded on arbitrary sites.
export const dynamic = "force-dynamic";

const HOLD_MINUTES = 10;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status, headers: CORS_HEADERS });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const cal = await getCalendarBySlug(slug);
  if (!cal) return bad("Calendar not found", 404);

  let body: {
    start?: string;
    name?: string;
    email?: string;
    notes?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return bad("Invalid request body");
  }

  const start = body.start;
  const name = body.name?.trim();
  const email = body.email?.trim();
  if (!start || !name || !email) {
    return bad("Name, email and a time slot are required");
  }

  // Re-validate the slot server-side against freshly computed availability —
  // never trust the client's slot list.
  const nowMs = Date.now();
  const windowEnd = new Date(
    nowMs + cal.window_days * 24 * 60 * 60 * 1000,
  ).toISOString();
  const [busy, bookings] = await Promise.all([
    freeBusy(new Date(nowMs).toISOString(), windowEnd),
    listBookings(cal.id),
  ]);
  const bookable = isSlotBookable(cal, start, {
    calendarId: cal.id,
    nowMs,
    busy,
    bookings,
  });
  if (!bookable) {
    return bad("That time is no longer available. Please pick another slot.", 409);
  }

  const end = new Date(
    new Date(start).getTime() + cal.slot_minutes * 60 * 1000,
  ).toISOString();

  const isPaid = cal.paid && cal.price > 0;

  // Link/create the CRM contact up front (both flows want it).
  const { customer } = await upsertCustomerByEmail({
    name,
    email,
    lead_source: "booking",
  });

  // Atomically reserve the slot. The DB exclusion constraint (or the memory
  // overlap check) rejects a conflicting slot → null.
  const reserved = await bookSlot({
    calendar_id: cal.id,
    customer_id: customer.id,
    status: isPaid ? "pending" : "confirmed",
    starts_at: start,
    ends_at: end,
    attendee_name: name,
    attendee_email: email,
    notes: body.notes?.trim() || null,
    hold_expires_at: isPaid
      ? new Date(nowMs + HOLD_MINUTES * 60 * 1000).toISOString()
      : null,
    amount: isPaid ? cal.price : null,
    currency: isPaid ? cal.currency : null,
  });
  if (!reserved) {
    return bad("That time was just taken. Please pick another slot.", 409);
  }

  if (!isPaid) {
    // Free: confirm immediately (creates the Google event, links contact).
    await confirmBooking(cal.id, reserved.id);
    return NextResponse.json(
      { ok: true, status: "confirmed", booking_id: reserved.id },
      { headers: CORS_HEADERS },
    );
  }

  // Paid: create a Stripe Checkout session (or a demo confirm URL) and record
  // the session id on the pending hold so the webhook can find it later.
  const checkout = await createCheckoutSession({
    calendarId: cal.id,
    bookingId: reserved.id,
    slug,
    productName: cal.name,
    amount: cal.price,
    currency: cal.currency,
    customerEmail: email,
    successUrl: `${env.appUrl()}/c/${slug}/confirm?booking=${reserved.id}&cal=${cal.id}`,
    cancelUrl: `${env.appUrl()}/c/${slug}?canceled=1`,
  });

  await updateBooking(reserved.id, { stripe_session_id: checkout.sessionId });

  return NextResponse.json(
    { ok: true, status: "checkout", checkout_url: checkout.url },
    { headers: CORS_HEADERS },
  );
}
