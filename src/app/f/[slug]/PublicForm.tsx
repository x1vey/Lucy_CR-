"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import type { FormFieldDef } from "@/lib/types";

// The actual rendered form. Posts to the public ingest endpoint using the
// form's token. Works both as a standalone page and inside an <iframe>.
export default function PublicForm({
  token,
  name,
  fields,
}: {
  token: string;
  name: string;
  fields: FormFieldDef[];
}) {
  const [values, setValues] = React.useState<Record<string, string | boolean>>(
    {},
  );
  const [status, setStatus] = React.useState<"idle" | "sending" | "done">(
    "idle",
  );
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    try {
      const payload = { ...values };
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        for (const [key, val] of params.entries()) {
          if (key.startsWith("utm_")) {
            payload[key] = val;
          }
        }
      }

      const res = await fetch(`/api/ingest/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Submission failed");
      }
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStatus("idle");
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
        }}
      >
        {status === "done" ? (
          <Stack spacing={2} alignItems="center" sx={{ py: 4 }}>
            <CheckCircleIcon color="success" sx={{ fontSize: 48 }} />
            <Typography variant="h6">Thank you!</Typography>
            <Typography variant="body2" color="text.secondary" textAlign="center">
              Your response has been received.
            </Typography>
          </Stack>
        ) : (
          <form onSubmit={handleSubmit}>
            <Typography variant="h5" sx={{ mb: 3 }}>
              {name}
            </Typography>
            <Stack spacing={2.5}>
              {fields.map((f) =>
                f.type === "checkbox" ? (
                  <FormControlLabel
                    key={f.key}
                    control={
                      <Checkbox
                        checked={Boolean(values[f.key])}
                        onChange={(e) =>
                          setValues((v) => ({ ...v, [f.key]: e.target.checked }))
                        }
                      />
                    }
                    label={f.label + (f.required ? " *" : "")}
                  />
                ) : (
                  <TextField
                    key={f.key}
                    label={f.label}
                    type={
                      f.type === "email"
                        ? "email"
                        : f.type === "number"
                          ? "number"
                          : "text"
                    }
                    required={f.required}
                    multiline={f.type === "textarea"}
                    minRows={f.type === "textarea" ? 3 : undefined}
                    value={(values[f.key] as string) ?? ""}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [f.key]: e.target.value }))
                    }
                    fullWidth
                  />
                ),
              )}
              {error && <Alert severity="error">{error}</Alert>}
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={status === "sending"}
              >
                {status === "sending" ? "Sending…" : "Submit"}
              </Button>
            </Stack>
          </form>
        )}
      </Box>
    </Box>
  );
}
