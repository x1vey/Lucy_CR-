"use client";

import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";

// A single KPI tile: label + big value + optional sublabel. No plot, so no
// hover layer needed (per dataviz: a bare stat tile is the one form that skips
// interaction).
export default function StatTile({
  label,
  value,
  sublabel,
  icon,
  accent = "#2a78d6",
}: {
  label: string;
  value: string;
  sublabel?: string;
  icon?: React.ReactNode;
  accent?: string;
}) {
  return (
    <Card
      sx={{
        height: "100%",
        position: "relative",
        overflow: "hidden",
        "&:hover": {
          transform: "translateY(-2px)",
          boxShadow: (t) => t.shadows[3],
          borderColor: alpha(accent, 0.4),
        },
        // Accent hairline down the left edge.
        "&::before": {
          content: '""',
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          bgcolor: accent,
        },
      }}
    >
      <CardContent>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: 1.5,
          }}
        >
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontWeight: 600 }}
          >
            {label}
          </Typography>
          {icon && (
            <Box
              sx={{
                color: accent,
                bgcolor: alpha(accent, 0.12),
                width: 36,
                height: 36,
                borderRadius: 2,
                display: "grid",
                placeItems: "center",
                "& svg": { fontSize: 20 },
              }}
            >
              {icon}
            </Box>
          )}
        </Box>
        <Typography
          variant="h4"
          sx={{ fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.1 }}
        >
          {value}
        </Typography>
        {sublabel && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ mt: 0.5, display: "block" }}
          >
            {sublabel}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
