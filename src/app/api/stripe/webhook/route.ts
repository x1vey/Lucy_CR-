import { NextRequest, NextResponse } from "next/server";
import { verifyWebhook } from "@/lib/stripe";
import { findBookingByStripeSession } from "@/lib/db";
import { confirmBooking } from "@/lib/booking";
import { isBookingActive } from "@/lib/availability";

// Stripe webhook — the source of truth for paid bookings. Fires even if the
// customer closes the tab after paying, so a paid booking is never lost. The
// success-redirect page only reads status; it does NOT confirm.
//
// Idempotent: Stripe may redeliver events. Confirming an already-confirmed
// booking is a no-op (see confirmBooking).
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get("stripe-signature");
  const event = verifyWebhook(raw, sig);
  if (!event) {
    return NextResponse.json({ ok: false, error: "bad signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as {
      id?: string;
      metadata?: { calendar_id?: string; booking_id?: string };
    };
    const sessionId = session.id;
    const calendarId = session.metadata?.calendar_id;
    const bookingId = session.metadata?.booking_id;

    // Prefer metadata; fall back to a session-id lookup.
    if (calendarId && bookingId) {
      await confirmBooking(calendarId, bookingId);
    } else if (sessionId) {
      const found = await findBookingByStripeSession(sessionId);
      if (found) {
        // Only confirm if the hold hasn't already expired and been reclaimed.
        if (isBookingActive(found.booking, Date.now())) {
          await confirmBooking(found.calendar.id, found.booking.id);
        }
      }
    }
  }

  // Always 200 so Stripe stops retrying handled events.
  return NextResponse.json({ received: true });
}
