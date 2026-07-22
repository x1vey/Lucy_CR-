"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import type { FormRow } from "./FormsClient";

// Three ways to use a form on another site:
//  1. iframe   — drop the hosted form straight in (zero code).
//  2. link     — share the hosted URL directly.
//  3. tracking — POST your OWN form's fields to the ingest endpoint via JS.
export default function EmbedDialog({
  open,
  form,
  appUrl,
  onClose,
}: {
  open: boolean;
  form: FormRow | null;
  appUrl: string;
  onClose: () => void;
}) {
  const [tab, setTab] = React.useState(0);
  const [copied, setCopied] = React.useState(false);

  if (!form) return null;

  const formUrl = `${appUrl}/f/${form.slug}`;
  const ingestUrl = `${appUrl}/api/ingest/${form.token}`;

  const iframeSnippet = `<iframe
  id="lucy-iframe-${form.slug}"
  src="${formUrl}"
  title="${form.name}"
  style="width:100%;max-width:480px;height:640px;border:0;"
  loading="lazy"
></iframe>
<script>
  (function() {
    var iframe = document.getElementById("lucy-iframe-${form.slug}");
    if (window.location.search) {
      iframe.src = iframe.src + (iframe.src.indexOf('?') === -1 ? '?' : '&') + window.location.search.substring(1);
    }
  })();
</script>`;

  const fieldKeys = form.fields.map((f) => f.key);
  const trackingSnippet = `<!-- Your own form markup. The input "name" attributes
     must match the field keys: ${fieldKeys.join(", ")} -->
<form id="lucy-form">
${form.fields
  .map(
    (f) =>
      `  <input name="${f.key}" placeholder="${f.label}"${
        f.required ? " required" : ""
      } />`,
  )
  .join("\n")}
  <button type="submit">Submit</button>
</form>

<script>
  document.getElementById("lucy-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    
    // Capture UTM parameters from the URL
    const params = new URLSearchParams(window.location.search);
    for (const [key, val] of params.entries()) {
      if (key.startsWith("utm_")) {
        data[key] = val;
      }
    }

    const res = await fetch("${ingestUrl}", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      e.target.reset();
      alert("Thanks! Your response was received.");
    }
  });
</script>`;

  const snippets = [iframeSnippet, formUrl, trackingSnippet];
  const current = snippets[tab];

  async function copy() {
    try {
      await navigator.clipboard.writeText(current);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (e.g. insecure context) — user can select manually.
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Embed · {form.name}</DialogTitle>
      <DialogContent>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
          <Tab label="iframe" />
          <Tab label="Direct link" />
          <Tab label="Tracking code" />
        </Tabs>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {tab === 0 &&
            "Paste this where you want the form to appear. It renders our hosted form — no styling needed on your end."}
          {tab === 1 &&
            "Share this link directly, or use it as the target of a button. Opens the standalone hosted form."}
          {tab === 2 &&
            "Keep your own form design and just send the data to us. Make sure each input's name matches the field key shown."}
        </Typography>

        <Box sx={{ position: "relative" }}>
          <Box
            component="pre"
            sx={{
              m: 0,
              p: 2,
              pr: 6,
              bgcolor: "#0f172a",
              color: "#e2e8f0",
              borderRadius: 2,
              fontSize: 13,
              lineHeight: 1.6,
              overflowX: "auto",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {current}
          </Box>
          <Tooltip title={copied ? "Copied!" : "Copy"}>
            <IconButton
              onClick={copy}
              size="small"
              sx={{
                position: "absolute",
                top: 8,
                right: 8,
                color: "#e2e8f0",
                bgcolor: "rgba(255,255,255,0.08)",
                "&:hover": { bgcolor: "rgba(255,255,255,0.18)" },
              }}
            >
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        {!form.active && (
          <Typography variant="caption" color="warning.main" sx={{ mt: 2, display: "block" }}>
            This form is currently inactive — submissions will be rejected until
            you activate it.
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Stack direction="row" spacing={1}>
          <Button
            component="a"
            href={formUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Preview form
          </Button>
          <Button variant="contained" onClick={onClose}>
            Done
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}
