"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import InputAdornment from "@mui/material/InputAdornment";
import LinkIcon from "@mui/icons-material/Link";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { alpha } from "@mui/material/styles";
import { buildUtmUrl } from "@/lib/utm";
import type { UtmParams } from "@/lib/types";

export default function UtmBuilderClient() {
  const [baseUrl, setBaseUrl] = React.useState("");
  const [utm, setUtm] = React.useState<UtmParams>({});
  const [copied, setCopied] = React.useState(false);

  const generatedUrl = React.useMemo(
    () => buildUtmUrl(baseUrl, utm),
    [baseUrl, utm],
  );

  const handleCopy = () => {
    if (!generatedUrl) return;
    navigator.clipboard.writeText(generatedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const updateUtm = (key: keyof UtmParams, value: string) => {
    setUtm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Card sx={{ borderRadius: 3, boxShadow: "0 4px 24px rgba(0,0,0,0.04)" }}>
        <CardContent sx={{ p: 4, display: "flex", flexDirection: "column", gap: 3 }}>
          <TextField
            label="Base URL"
            placeholder="example.com/landing-page"
            fullWidth
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <LinkIcon color="action" />
                </InputAdornment>
              ),
            }}
            helperText="The destination web page you want to track."
          />

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 3 }}>
            <TextField
              label="Source (utm_source)"
              placeholder="e.g. google, newsletter"
              fullWidth
              value={utm.utm_source || ""}
              onChange={(e) => updateUtm("utm_source", e.target.value)}
              helperText="The referrer (e.g. facebook, twitter)."
            />
            <TextField
              label="Medium (utm_medium)"
              placeholder="e.g. cpc, email"
              fullWidth
              value={utm.utm_medium || ""}
              onChange={(e) => updateUtm("utm_medium", e.target.value)}
              helperText="Marketing medium (e.g. banner, email)."
            />
            <TextField
              label="Campaign (utm_campaign)"
              placeholder="e.g. summer_sale"
              fullWidth
              value={utm.utm_campaign || ""}
              onChange={(e) => updateUtm("utm_campaign", e.target.value)}
              helperText="Product, promo code, or slogan."
            />
            <TextField
              label="Term (utm_term)"
              placeholder="e.g. crm+software"
              fullWidth
              value={utm.utm_term || ""}
              onChange={(e) => updateUtm("utm_term", e.target.value)}
              helperText="Identify the paid keywords."
            />
            <TextField
              label="Content (utm_content)"
              placeholder="e.g. logolink"
              fullWidth
              value={utm.utm_content || ""}
              onChange={(e) => updateUtm("utm_content", e.target.value)}
              helperText="Use to differentiate ads."
            />
          </Box>
        </CardContent>
      </Card>

      <Card
        sx={{
          borderRadius: 3,
          bgcolor: (t) => alpha(t.palette.primary.main, 0.03),
          border: "1px solid",
          borderColor: (t) => alpha(t.palette.primary.main, 0.1),
        }}
      >
        <CardContent sx={{ p: 4 }}>
          <Typography variant="overline" color="primary.main" sx={{ fontWeight: 700 }}>
            Generated Campaign URL
          </Typography>
          <Box
            sx={{
              mt: 2,
              p: 2,
              bgcolor: "background.paper",
              borderRadius: 2,
              border: "1px solid",
              borderColor: "divider",
              minHeight: 60,
              display: "flex",
              alignItems: "center",
              wordBreak: "break-all",
              fontFamily: "monospace",
              fontSize: 14,
            }}
          >
            {generatedUrl ? (
              <Typography variant="body2" sx={{ fontFamily: "inherit" }}>
                {generatedUrl}
              </Typography>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
                Enter a base URL to generate your link.
              </Typography>
            )}
          </Box>

          <Box sx={{ mt: 3, display: "flex", justifyContent: "flex-end" }}>
            <Button
              variant="contained"
              size="large"
              disabled={!generatedUrl}
              onClick={handleCopy}
              startIcon={copied ? <CheckCircleIcon /> : <ContentCopyIcon />}
              sx={{
                bgcolor: copied ? "success.main" : "primary.main",
                "&:hover": { bgcolor: copied ? "success.dark" : "primary.dark" },
              }}
            >
              {copied ? "Copied!" : "Copy Link"}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
