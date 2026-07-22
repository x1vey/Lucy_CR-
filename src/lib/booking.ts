import "server-only";

import {
  getBooking,
  getCalendar,
  recordActivity,
  updateBooking,
  upsertCustomerByEmail,
} from "@/lib/db";
import { insertEvent } from "@/lib/google";
import type { Booking, Calendar } from "@/lib/types";

// Shared booking-confirmation path used by BOTH the free flow, the Stripe
// webhook, and the demo confirm page. Idempotent: confirming an already-
// confirmed booking is a no-op that returns the existing booking.

/**
 * Confirm a (pending) booking: link/create the CRM contact, create the Google
 * Calendar event, and flip status → confirmed. Safe to call more than once
 * (webhooks can be redelivered).
 */
export async function confirmBooking(
  calendarId: string,
  bookingId: string,
): Promise<Booking | null> {
  const cal = await getCalendar(calendarId);
  if (!cal) return null;
  const booking = await getBooking(bookingId);
  if (!booking || booking.calendar_id !== calendarId) return null;
  if (booking.status === "confirmed") return booking; // idempotent
  if (booking.status === "canceled") return null;

  // Link the attendee to a CRM contact.
  let customerId = booking.customer_id;
  if (!customerId && booking.attendee_email) {
    const { customer } = await upsertCustomerByEmail({
      name: booking.attendee_name || booking.attendee_email,
      email: booking.attendee_email,
      lead_source: "booking",
    });
    customerId = customer.id;
  }

  // Create the calendar event (real when Google is live; mocked in demo mode).
  const googleEventId =
    booking.google_event_id ??
    (await insertEvent({
      summary: `${cal.name} — ${booking.attendee_name}`,
      description: booking.notes ?? undefined,
      start: booking.starts_at,
      end: booking.ends_at,
      attendeeEmail: booking.attendee_email,
      attendeeName: booking.attendee_name,
    }));

  const confirmed = await updateBooking(bookingId, {
    status: "confirmed",
    customer_id: customerId,
    google_event_id: googleEventId,
    hold_expires_at: null,
  });

  // Log the booking on the contact's timeline.
  if (confirmed && customerId) {
    await recordActivity({
      customer_id: customerId,
      type: "booking",
      payload: {
        calendar: cal.name,
        starts_at: booking.starts_at,
        ends_at: booking.ends_at,
      },
    });
  }

  return confirmed;
}

/** Convenience label for the public pages. */
export function calendarPriceLabel(cal: Calendar): string {
  if (!cal.paid || cal.price <= 0) return "Free";
  return `${cal.price} ${cal.currency}`;
}
