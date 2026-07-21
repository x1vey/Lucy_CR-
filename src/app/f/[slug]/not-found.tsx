import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

export default function FormNotFound() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        p: 3,
        textAlign: "center",
      }}
    >
      <Typography variant="h5" sx={{ mb: 1 }}>
        Form not available
      </Typography>
      <Typography variant="body2" color="text.secondary">
        This form doesn&apos;t exist or is no longer active.
      </Typography>
    </Box>
  );
}
