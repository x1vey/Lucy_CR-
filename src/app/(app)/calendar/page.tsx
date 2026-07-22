import Box from "@mui/material/Box";
import { listBookings, listCalendars } from "@/lib/db";
import { env } from "@/lib/env";
import CalendarClient, { type CalendarRow } from "./CalendarClient";

export const dynamic = "force-dynamic";

export default async function CalendarsPage() {
  const calendars = await listCalendars();
  const nowMs = Date.now();

  const rows: CalendarRow[] = await Promise.all(
    calendars.map(async (c) => {
      const bookings = await listBookings(c.id);
      const upcoming = bookings.filter(
        (b) => b.status !== "canceled" && new Date(b.starts_at).getTime() >= nowMs,
      ).length;
      return {
        id: c.id,
        name: c.name,
        description: c.description,
        slug: c.slug,
        price: c.price,
        currency: c.currency,
        paid: c.paid,
        slot_minutes: c.slot_minutes,
        utc_offset_minutes: c.utc_offset_minutes,
        timezone_label: c.timezone_label,
        lead_time_minutes: c.lead_time_minutes,
        window_days: c.window_days,
        weekly_hours: c.weekly_hours,
        busyness: c.busyness,
        upcoming,
        total_bookings: bookings.length,
      };
    }),
  );

  return (
    <Box>
      <CalendarClient rows={rows} appUrl={env.appUrl()} />
    </Box>
  );
}
