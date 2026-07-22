"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import Divider from "@mui/material/Divider";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ScheduleIcon from "@mui/icons-material/Schedule";
import { alpha } from "@mui/material/styles";
import type { DaySlots } from "@/lib/availability";

export default function PublicBooking({
  slug,
  name,
  description,
  paid,
  price,
  currency,
  slotMinutes,
  timezoneLabel,
  days,
}: {
  slug: string;
  name: string;
  description: string | null;
  paid: boolean;
  price: number;
  currency: string;
  slotMinutes: number;
  timezoneLabel: string;
  days: DaySlots[];
}) {
  const firstDayWithSlots =
    days.find((d) => d.slots.some((s) => s.available))?.date ??
    days[0]?.date ??
    null;
  const [selectedDate, setSelectedDate] = React.useState<string | null>(
    firstDayWithSlots,
  );
  const [selectedSlot, setSelectedSlot] = React.useState<string | null>(null);
  const [name_, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [status, setStatus] = React.useState<
    "idle" | "sending" | "done" | "redirecting"
  >("idle");
  const [error, setError] = React.useState<string | null>(null);

  const day = days.find((d) => d.date === selectedDate) ?? null;

  async function book() {
    if (!selectedSlot) {
      setError("Pick a time first");
      return;
    }
    if (!name_.trim() || !email.trim()) {
      setError("Your name and email are required");
      return;
    }
    setStatus("sending");
    setError(null);
    try {
      const res = await fetch(`/api/book/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: selectedSlot,
          name: name_.trim(),
          email: email.trim(),
          notes: notes.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Booking failed");
      if (data.status === "checkout" && data.checkout_url) {
        setStatus("redirecting");
        window.location.href = data.checkout_url;
        return;
      }
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStatus("idle");
    }
  }

  if (status === "done") {
    return (
      <Shell>
        <Stack spacing={2} alignItems="center" sx={{ py: 4 }}>
          <CheckCircleIcon color="success" sx={{ fontSize: 48 }} />
          <Typography variant="h6">You&apos;re booked!</Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            A confirmation has been recorded. See you then.
          </Typography>
        </Stack>
      </Shell>
    );
  }

  const priceLabel = paid ? `${price} ${currency}` : "Free";

  return (
    <Shell wide>
      <Stack spacing={0.5} sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="h5">{name}</Typography>
          <Chip
            size="small"
            color={paid ? "primary" : "default"}
            variant="outlined"
            label={priceLabel}
          />
        </Stack>
        {description && (
          <Typography variant="body2" color="text.secondary">
            {description}
          </Typography>
        )}
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
          <ScheduleIcon sx={{ fontSize: 16, color: "text.secondary" }} />
          <Typography variant="caption" color="text.secondary">
            {slotMinutes} min · times shown in {timezoneLabel}
          </Typography>
        </Stack>
      </Stack>

      {days.length === 0 ? (
        <Alert severity="info">No availability right now. Check back soon.</Alert>
      ) : (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          {/* Day picker */}
          <Box sx={{ minWidth: 150 }}>
            <Typography variant="caption" color="text.secondary">
              Choose a day
            </Typography>
            <Stack
              spacing={0.5}
              sx={{ mt: 0.5, maxHeight: 320, overflowY: "auto", pr: 0.5 }}
            >
              {days.map((d) => {
                const openCount = d.slots.filter((s) => s.available).length;
                const active = d.date === selectedDate;
                return (
                  <Button
                    key={d.date}
                    size="small"
                    variant={active ? "contained" : "outlined"}
                    disabled={openCount === 0}
                    onClick={() => {
                      setSelectedDate(d.date);
                      setSelectedSlot(null);
                    }}
                    sx={{ justifyContent: "space-between", textTransform: "none" }}
                  >
                    <span>{d.label}</span>
                    <Typography variant="caption" sx={{ ml: 1, opacity: 0.7 }}>
                      {openCount || "—"}
                    </Typography>
                  </Button>
                );
              })}
            </Stack>
          </Box>

          {/* Slot grid */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary">
              Choose a time
            </Typography>
            <Box
              sx={{
                mt: 0.5,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))",
                gap: 1,
                maxHeight: 220,
                overflowY: "auto",
              }}
            >
              {day?.slots.map((s) => {
                const selected = s.start === selectedSlot;
                return (
                  <Button
                    key={s.start}
                    size="small"
                    disabled={!s.available}
                    variant={selected ? "contained" : "outlined"}
                    onClick={() => setSelectedSlot(s.start)}
                    sx={{
                      textTransform: "none",
                      ...(!s.available && {
                        textDecoration: "line-through",
                        opacity: 0.5,
                      }),
                    }}
                  >
                    {s.local_time}
                  </Button>
                );
              })}
            </Box>

            <Divider sx={{ my: 2 }} />

            {/* Attendee details */}
            <Stack spacing={2}>
              <TextField
                label="Your name"
                value={name_}
                onChange={(e) => setName(e.target.value)}
                required
                fullWidth
                size="small"
              />
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                fullWidth
                size="small"
              />
              <TextField
                label="Anything we should know?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                multiline
                minRows={2}
                fullWidth
                size="small"
              />
              {error && <Alert severity="error">{error}</Alert>}
              <Button
                variant="contained"
                size="large"
                disabled={
                  !selectedSlot ||
                  status === "sending" ||
                  status === "redirecting"
                }
                onClick={book}
              >
                {status === "sending"
                  ? "Booking…"
                  : status === "redirecting"
                    ? "Redirecting to payment…"
                    : paid
                      ? `Pay ${priceLabel} & book`
                      : "Confirm booking"}
              </Button>
            </Stack>
          </Box>
        </Stack>
      )}
    </Shell>
  );
}

function Shell({
  children,
  wide,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 2,
        bgcolor: "background.default",
      }}
    >
      <Box
        sx={{
          width: "100%",
          maxWidth: wide ? 640 : 460,
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 3,
          p: { xs: 3, sm: 4 },
          boxShadow: (t) => `0 8px 40px ${alpha(t.palette.common.black, 0.06)}`,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
