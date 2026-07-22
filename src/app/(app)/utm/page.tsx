import PageHeader from "@/components/PageHeader";
import Box from "@mui/material/Box";
import UtmBuilderClient from "./UtmBuilderClient";

export default function UtmPage() {
  return (
    <Box>
      <PageHeader
        title="UTM Link Builder"
        subtitle="Generate trackable URLs to measure campaign performance in Lucy CRM."
      />
      <Box sx={{ maxWidth: 800 }}>
        <UtmBuilderClient />
      </Box>
    </Box>
  );
}
