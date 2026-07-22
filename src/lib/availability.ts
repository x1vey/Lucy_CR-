import type { Booking, Calendar } from "@/lib/types";

// ---------------------------------------------------------------------------
// Availability engine — pure, dependency-free, deterministic.
//
// Given a calendar's config + the busy intervals it must avoid, produces the
// bookable slot grid the public page renders. Availability =
//   configured open hours
//   − past / inside-lead-time
//   − Google Calendar busy intervals
//   − existing (confirmed / live-pending) bookings
//   − a deterministic "random busy" set that signals scarcity
//
// Wall-clock hours are interpreted at a FIXED numeric UTC offset (no IANA/DST),
// which keeps the math identical on server and client and avoids a timezone
// dependency. All emitted start/end are ISO UTC instants.
// ---------------------------------------------------------------------------

export interface Interval {
  start: string; // ISO UTC
  end: string; // ISO UTC
}

export interface SlotView {
  start: string; // ISO UTC
  end: string; // ISO UTC
  local_time: string; // "HH:MM" in the calendar's local offset (display only)
  available: boolean; // false = shown but not bookable (busy)
}

export interface DaySlots {
  date: string; // local "YYYY-MM-DD"
  weekday: number; // 0=Sun..6=Sat
  label: string; // e.g. "Mon, Aug 4"
  slots: SlotView[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Small deterministic string hash (FNV-1a) mapped into [0,1). Used so a slot's
// "random busy" verdict is stable across renders and between server & client —
// it only changes when the epoch bucket advances.
function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // >>> 0 → unsigned; divide by 2^32 for a value in [0,1).
  return (h >>> 0) / 0x100000000;
}

function two(n: number): string {
  return String(n).padStart(2, "0");
}

function overlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Is this booking still holding its slot at `nowMs`? */
export function isBookingActive(b: Booking, nowMs: number): boolean {
  if (b.status === "canceled") return false;
  if (
    b.status === "pending" &&
    b.hold_expires_at &&
    new Date(b.hold_expires_at).getTime() < nowMs
  ) {
    return false; // expired hold — slot is free again
  }
  return true;
}

export interface ComputeOpts {
  calendarId: string; // seeds the deterministic busyness
  nowMs: number; // "now" as a UTC epoch ms
  busy?: Interval[]; // external busy intervals (Google free/busy)
  bookings?: Booking[]; // existing bookings on this calendar (own table now)
  maxDays?: number; // hard cap on how many days to emit
}

export function computeAvailability(
  cfg: Calendar,
  opts: ComputeOpts,
): DaySlots[] {
  const { calendarId, nowMs } = opts;
  const offsetMs = cfg.utc_offset_minutes * 60 * 1000;
  const slotMs = cfg.slot_minutes * 60 * 1000;
  const leadMs = cfg.lead_time_minutes * 60 * 1000;
  const earliest = nowMs + leadMs;

  // Precompute busy + active-booking intervals as epoch-ms pairs.
  const busyMs = (opts.busy ?? []).map((b) => [
    new Date(b.start).getTime(),
    new Date(b.end).getTime(),
  ]);
  const bookingMs = (opts.bookings ?? [])
    .filter((b) => isBookingActive(b, nowMs))
    .map((b) => [new Date(b.starts_at).getTime(), new Date(b.ends_at).getTime()]);

  // Local "now" → the local calendar date to start iterating from.
  const localNow = new Date(nowMs + offsetMs);
  const startY = localNow.getUTCFullYear();
  const startMo = localNow.getUTCMonth();
  const startD = localNow.getUTCDate();

  const days = Math.min(cfg.window_days, opts.maxDays ?? 60);
  const out: DaySlots[] = [];

  for (let d = 0; d <= days; d++) {
    // The local date d days after today (built in UTC space, then read back).
    const localDate = new Date(Date.UTC(startY, startMo, startD + d));
    const y = localDate.getUTCFullYear();
    const mo = localDate.getUTCMonth();
    const day = localDate.getUTCDate();
    const weekday = localDate.getUTCDay();

    const windows = cfg.weekly_hours[weekday] ?? [];
    if (windows.length === 0) continue;

    const slots: SlotView[] = [];
    for (const w of windows) {
      const [wsH, wsM] = w.start.split(":").map(Number);
      const [weH, weM] = w.end.split(":").map(Number);
      const winStartLocal = Date.UTC(y, mo, day, wsH, wsM);
      const winEndLocal = Date.UTC(y, mo, day, weH, weM);

      for (
        let localStart = winStartLocal;
        localStart + slotMs <= winEndLocal + 1;
        localStart += slotMs
      ) {
        // Convert local wall-clock → UTC instant: UTC = local − offset.
        const utcStart = localStart - offsetMs;
        const utcEnd = utcStart + slotMs;
        if (utcStart < earliest) continue; // past or inside lead time

        const startISO = new Date(utcStart).toISOString();

        let available = true;
        for (const [bs, be] of busyMs)
          if (overlaps(utcStart, utcEnd, bs, be)) { available = false; break; }
        if (available)
          for (const [bs, be] of bookingMs)
            if (overlaps(utcStart, utcEnd, bs, be)) { available = false; break; }
        if (available && cfg.busyness.enabled) {
          const bucket =
            cfg.busyness.epoch_days > 0
              ? Math.floor(nowMs / DAY_MS / cfg.busyness.epoch_days)
              : 0;
          const r = hash01(`${calendarId}:${startISO}:${bucket}`);
          if (r < cfg.busyness.fraction) available = false;
        }

        const localDt = new Date(localStart);
        slots.push({
          start: startISO,
          end: new Date(utcEnd).toISOString(),
          local_time: `${two(localDt.getUTCHours())}:${two(localDt.getUTCMinutes())}`,
          available,
        });
      }
    }

    if (slots.length === 0) continue;
    out.push({
      date: `${y}-${two(mo + 1)}-${two(day)}`,
      weekday,
      label: `${WEEKDAY_NAMES[weekday]}, ${MONTH_NAMES[mo]} ${day}`,
      slots,
    });
  }

  return out;
}

/**
 * Server-side re-validation: is a specific [start,end) still genuinely bookable
 * right now? The client slot list can be stale, so the booking API calls this
 * against freshly computed availability before writing.
 */
export function isSlotBookable(
  cfg: Calendar,
  startISO: string,
  opts: ComputeOpts,
): boolean {
  const days = computeAvailability(cfg, opts);
  for (const d of days)
    for (const s of d.slots)
      if (s.start === startISO && s.available) return true;
  return false;
}
