"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Box sx={{ p: 4, maxWidth: 600, mx: "auto", mt: 10 }}>
      <Alert severity="error" sx={{ mb: 3 }}>
        <Typography variant="h6">Something went wrong!</Typography>
        <Typography variant="body2" sx={{ mt: 1, fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {error.message || "Unknown error occurred"}
        </Typography>
        {error.stack && (
          <Box sx={{ mt: 2, p: 2, bgcolor: "rgba(0,0,0,0.05)", borderRadius: 1, overflowX: "auto" }}>
            <Typography variant="caption" sx={{ fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
              {error.stack}
            </Typography>
          </Box>
        )}
        {error.digest && (
          <Typography variant="caption" sx={{ display: "block", mt: 1 }}>
            Digest: {error.digest}
          </Typography>
        )}
      </Alert>
      <Button variant="contained" onClick={() => reset()}>
        Try again
      </Button>
    </Box>
  );
}
