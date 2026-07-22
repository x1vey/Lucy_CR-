"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import { alpha } from "@mui/material/styles";
import GoogleIcon from "@mui/icons-material/Google";
import PaymentIcon from "@mui/icons-material/Payment";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import PageHeader from "@/components/PageHeader";
import { disconnectGoogleAction } from "../../actions";

type Toast = { severity: "success" | "error"; msg: string } | null;

export default function IntegrationsClient({
  googleConfigured,
  stripeConfigured,
  leadConnectorConfigured,
  googleConnected,
  googleEmail,
}: {
  googleConfigured: boolean;
  stripeConfigured: boolean;
  leadConnectorConfigured: boolean;
  googleConnected: boolean;
  googleEmail: string | null;
}) {
  const router = useRouter();
  const [toast, setToast] = React.useState<Toast>(null);
  const [pending, startTransition] = React.useTransition();

  function disconnect() {
    startTransition(async () => {
      try {
        await disconnectGoogleAction();
        setToast({ severity: "success", msg: "Google disconnected" });
        router.refresh();
      } catch (e) {
        setToast({
          severity: "error",
          msg: e instanceof Error ? e.message : "Something went wrong",
        });
      }
    });
  }

  return (
    <Box>
      <PageHeader
        title="Integrations"
        subtitle="Connect Google Calendar (for availability + event creation) and Stripe (to accept payment for paid calendars)."
      />

      <Stack spacing={2} sx={{ maxWidth: 720 }}>
        <IntegrationCard
          icon={<GoogleIcon />}
          title="Google Calendar"
          live={googleConfigured}
          liveHint="Real free/busy + event creation"
          demoHint="Demo mode — availability ignores Google; events are mocked"
        >
          {!googleConfigured ? (
            <Typography variant="body2" color="text.secondary">
              Add <code>GOOGLE_CLIENT_ID</code> and{" "}
              <code>GOOGLE_CLIENT_SECRET</code> to your environment, then
              reload to enable connecting.
            </Typography>
          ) : googleConnected ? (
            <Stack
              direction="row"
              spacing={2}
              alignItems="center"
              justifyContent="space-between"
            >
              <Typography variant="body2">
                Connected{googleEmail ? ` as ${googleEmail}` : ""}.
              </Typography>
              <Button
                color="error"
                variant="outlined"
                disabled={pending}
                onClick={disconnect}
              >
                Disconnect
              </Button>
            </Stack>
          ) : (
            <Button
              variant="contained"
              component="a"
              href="/api/google/connect"
              startIcon={<GoogleIcon />}
            >
              Connect Google account
            </Button>
          )}
        </IntegrationCard>

        <IntegrationCard
          icon={<PaymentIcon />}
          title="Stripe"
          live={stripeConfigured}
          liveHint="Real Checkout for paid calendars"
          demoHint="Demo mode — paid bookings confirm via an internal test page"
        >
          <Typography variant="body2" color="text.secondary">
            {stripeConfigured
              ? "Stripe keys detected. Paid calendars will use Stripe Checkout."
              : "Add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to accept real payments. Until then, paid calendars use a demo confirm step."}
          </Typography>
        </IntegrationCard>

        <IntegrationCard
          icon={<MailOutlineIcon />}
          title="LeadConnector"
          live={leadConnectorConfigured}
          liveHint="Automation emails sent via LeadConnector"
          demoHint="Demo mode — automation emails are logged, not sent"
        >
          <Typography variant="body2" color="text.secondary">
            {leadConnectorConfigured
              ? "LeadConnector API key detected. Automation email steps send through your LeadConnector account."
              : "Add LEADCONNECTOR_API_KEY (and LEADCONNECTOR_LOCATION_ID) to send automation emails for real. Until then, email steps are recorded in the enrollment history as demo sends so you can still build and test sequences."}
          </Typography>
        </IntegrationCard>
      </Stack>

      <Snackbar
        open={!!toast}
        autoHideDuration={3500}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {toast ? (
          <Alert severity={toast.severity} onClose={() => setToast(null)}>
            {toast.msg}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}

function IntegrationCard({
  icon,
  title,
  live,
  liveHint,
  demoHint,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  live: boolean;
  liveHint: string;
  demoHint: string;
  children: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 3,
        p: 3,
        bgcolor: "background.paper",
      }}
    >
      <Stack
        direction="row"
        spacing={1.5}
        alignItems="center"
        sx={{ mb: 1.5 }}
      >
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 2,
            display: "grid",
            placeItems: "center",
            bgcolor: (t) => alpha(t.palette.primary.main, 0.1),
            color: "primary.main",
          }}
        >
          {icon}
        </Box>
        <Box sx={{ flexGrow: 1 }}>
          <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
          <Typography variant="caption" color="text.secondary">
            {live ? liveHint : demoHint}
          </Typography>
        </Box>
        <Chip
          size="small"
          color={live ? "success" : "warning"}
          variant="outlined"
          label={live ? "Live" : "Demo"}
        />
      </Stack>
      {children}
    </Box>
  );
}
