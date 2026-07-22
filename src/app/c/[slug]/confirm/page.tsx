import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import HourglassTopIcon from "@mui/icons-material/HourglassTop";
import Button from "@mui/material/Button";
import NextLink from "next/link";
import { getBooking } from "@/lib/db";
import { confirmBooking } from "@/lib/booking";
import { isStripeConfigured } from "@/lib/env";

// Post-checkout landing page.
//
// - Demo mode (?demo=1): Stripe was skipped, so THIS page performs the same
//   confirm-and-book step the webhook would (it's safe/idempotent).
// - Live mode: the Stripe webhook is the source of truth. This page only READS
//   the booking status — a closed tab still gets confirmed by the webhook.
export const dynamic = "force-dynamic";

export default async function ConfirmPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ booking?: string; cal?: string; demo?: string }>;
}) {
  const { slug } = await params;
  const { booking, cal, demo } = await searchParams;

  let confirmed = false;

  if (cal && booking) {
    // In demo mode (no Stripe), confirm here. In live mode we only confirm here
    // if the webhook hasn't yet — reading the status covers the common case.
    if (demo === "1" && !isStripeConfigured()) {
      const result = await confirmBooking(cal, booking);
      confirmed = result?.status === "confirmed";
    } else {
      const b = await getBooking(booking);
      confirmed = b?.status === "confirmed";
    }
  }

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
          maxWidth: 460,
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 3,
          p: { xs: 3, sm: 4 },
          boxShadow: "0 8px 40px rgba(0,0,0,0.06)",
        }}
      >
        <Stack spacing={2} alignItems="center" sx={{ py: 3 }} textAlign="center">
          {confirmed ? (
            <>
              <CheckCircleIcon color="success" sx={{ fontSize: 48 }} />
              <Typography variant="h6">Payment received — you&apos;re booked!</Typography>
              <Typography variant="body2" color="text.secondary">
                A confirmation has been recorded and the event added to the
                calendar.
              </Typography>
            </>
          ) : (
            <>
              <HourglassTopIcon color="warning" sx={{ fontSize: 48 }} />
              <Typography variant="h6">Finishing your booking…</Typography>
              <Typography variant="body2" color="text.secondary">
                If you completed payment, your booking will confirm momentarily.
                You can safely close this page.
              </Typography>
            </>
          )}
          <Button component={NextLink} href={`/c/${slug}`} variant="outlined">
            Back to calendar
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}
