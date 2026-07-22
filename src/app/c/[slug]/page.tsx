import { notFound } from "next/navigation";
import { getCalendarBySlug, listBookings } from "@/lib/db";
import { freeBusy } from "@/lib/google";
import { computeAvailability } from "@/lib/availability";
import PublicBooking from "./PublicBooking";

// Hosted public booking page. Lives outside the (app) route group so it renders
// chrome-free — link to it directly or embed via <iframe>. Availability is
// computed server-side; the calendar slug is the capability.
export const dynamic = "force-dynamic";

export default async function PublicBookingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cal = await getCalendarBySlug(slug);
  if (!cal) notFound();

  const nowMs = Date.now();
  const windowEnd = new Date(
    nowMs + cal.window_days * 24 * 60 * 60 * 1000,
  ).toISOString();
  const [busy, bookings] = await Promise.all([
    freeBusy(new Date(nowMs).toISOString(), windowEnd),
    listBookings(cal.id),
  ]);
  const days = computeAvailability(cal, {
    calendarId: cal.id,
    nowMs,
    busy,
    bookings,
  });

  return (
    <PublicBooking
      slug={slug}
      name={cal.name}
      description={cal.description}
      paid={cal.paid && cal.price > 0}
      price={cal.price}
      currency={cal.currency}
      slotMinutes={cal.slot_minutes}
      timezoneLabel={cal.timezone_label}
      days={days}
    />
  );
}
