import Box from "@mui/material/Box";
import { getIntegrationSettings } from "@/lib/db";
import {
  isGoogleConfigured,
  isLeadConnectorConfigured,
  isStripeConfigured,
} from "@/lib/env";
import IntegrationsClient from "./IntegrationsClient";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const settings = await getIntegrationSettings();
  return (
    <Box>
      <IntegrationsClient
        googleConfigured={isGoogleConfigured()}
        stripeConfigured={isStripeConfigured()}
        leadConnectorConfigured={isLeadConnectorConfigured()}
        googleConnected={settings.google.connected}
        googleEmail={settings.google.connected_email}
      />
    </Box>
  );
}
