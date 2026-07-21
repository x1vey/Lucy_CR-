"use client";

import * as React from "react";
import { useActionState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import SellIcon from "@mui/icons-material/Sell";
import { alpha } from "@mui/material/styles";
import { loginAction, type LoginState } from "./actions";

const initial: LoginState = { error: null };

export default function LoginForm({ showDemoHint }: { showDemoHint: boolean }) {
  const [state, formAction, pending] = useActionState(loginAction, initial);

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
          maxWidth: 410,
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 4,
          p: { xs: 3, sm: 4.5 },
          boxShadow: (t) => t.shadows[8],
        }}
      >
        <Stack spacing={1.5} alignItems="center" sx={{ mb: 3, textAlign: "center" }}>
          <Box
            sx={{
              width: 52,
              height: 52,
              borderRadius: 3,
              display: "grid",
              placeItems: "center",
              color: "#fff",
              background: (t) =>
                `linear-gradient(135deg, ${t.palette.primary.main}, ${t.palette.secondary.main})`,
              boxShadow: (t) => `0 8px 24px ${alpha(t.palette.primary.main, 0.4)}`,
            }}
          >
            <SellIcon sx={{ fontSize: 28 }} />
          </Box>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: -0.5 }}>
              Welcome back
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Sign in to Lucy CRM
            </Typography>
          </Box>
        </Stack>

        <form action={formAction}>
          <Stack spacing={2.5}>
            <TextField
              name="email"
              label="Email"
              type="email"
              required
              autoFocus
              fullWidth
              autoComplete="email"
            />
            <TextField
              name="password"
              label="Password"
              type="password"
              required
              fullWidth
              autoComplete="current-password"
            />
            {state.error && <Alert severity="error">{state.error}</Alert>}
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={pending}
            >
              {pending ? "Signing in…" : "Sign in"}
            </Button>
          </Stack>
        </form>

        {showDemoHint && (
          <Alert severity="info" sx={{ mt: 3 }}>
            Demo login — email <strong>admin@lucy.crm</strong>, password{" "}
            <strong>admin1234</strong>
          </Alert>
        )}
      </Box>
    </Box>
  );
}
