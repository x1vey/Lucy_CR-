import { createTheme, alpha, type Theme } from "@mui/material/styles";

export type ColorMode = "light" | "dark";

// Shared brand tokens — one indigo accent, kept calm so data-dense CRM screens
// stay readable in either mode.
const BRAND = {
  primary: "#4f46e5",
  primaryDark: "#4338ca",
  secondary: "#0ea5e9",
  success: "#10b981",
  warning: "#f59e0b",
  error: "#ef4444",
} as const;

const FONT =
  'var(--font-geist-sans), system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

// Soft, layered shadows (MUI's defaults are too heavy for a flat CRM UI).
function softShadow(mode: ColorMode) {
  const c = mode === "light" ? "0,0,0" : "0,0,0";
  const a = mode === "light" ? 1 : 2.2; // dark mode needs deeper shadows to read
  return {
    card: `0 1px 2px rgba(${c},${0.04 * a}), 0 1px 3px rgba(${c},${0.06 * a})`,
    cardHover: `0 4px 12px rgba(${c},${0.08 * a}), 0 2px 4px rgba(${c},${0.06 * a})`,
    pop: `0 10px 30px rgba(${c},${0.12 * a}), 0 4px 8px rgba(${c},${0.08 * a})`,
  };
}

// Build a full theme for the given color mode. Called by ThemeRegistry so the
// app can flip light/dark at runtime.
export function getTheme(mode: ColorMode): Theme {
  const isLight = mode === "light";
  const shadows = softShadow(mode);

  const palette = {
    mode,
    primary: { main: BRAND.primary, dark: BRAND.primaryDark },
    secondary: { main: BRAND.secondary },
    success: { main: BRAND.success },
    warning: { main: BRAND.warning },
    error: { main: BRAND.error },
    background: isLight
      ? { default: "#f5f6fa", paper: "#ffffff" }
      : { default: "#0b0d12", paper: "#141821" },
    divider: isLight ? "rgba(17,24,39,0.08)" : "rgba(148,163,184,0.14)",
    text: isLight
      ? { primary: "#0f172a", secondary: "#5b6472" }
      : { primary: "#e7ebf2", secondary: "#9aa4b2" },
  } as const;

  const theme = createTheme({
    palette,
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: FONT,
      h4: { fontWeight: 800, letterSpacing: -0.6 },
      h5: { fontWeight: 800, letterSpacing: -0.4 },
      h6: { fontWeight: 700, letterSpacing: -0.2 },
      subtitle1: { fontWeight: 700 },
      body2: { lineHeight: 1.5 },
      button: { textTransform: "none", fontWeight: 600 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            // Subtle top-down wash so the canvas isn't a flat slab.
            backgroundImage: isLight
              ? "radial-gradient(1200px 600px at 100% -10%, rgba(79,70,229,0.05), transparent 60%)"
              : "radial-gradient(1200px 600px at 100% -10%, rgba(79,70,229,0.14), transparent 60%)",
            backgroundAttachment: "fixed",
          },
          "*::-webkit-scrollbar": { width: 10, height: 10 },
          "*::-webkit-scrollbar-thumb": {
            backgroundColor: isLight
              ? "rgba(15,23,42,0.18)"
              : "rgba(148,163,184,0.28)",
            borderRadius: 8,
            border: "2px solid transparent",
            backgroundClip: "content-box",
          },
          "*::-webkit-scrollbar-thumb:hover": {
            backgroundColor: isLight
              ? "rgba(15,23,42,0.3)"
              : "rgba(148,163,184,0.45)",
          },
        },
      },
      MuiPaper: {
        styleOverrides: { root: { backgroundImage: "none" } },
      },
      MuiCard: {
        defaultProps: { elevation: 0, variant: "outlined" },
        styleOverrides: {
          root: {
            borderColor: palette.divider,
            boxShadow: shadows.card,
            transition:
              "box-shadow .2s ease, border-color .2s ease, transform .2s ease",
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: 10 },
          containedPrimary: {
            boxShadow: `0 1px 2px ${alpha(BRAND.primary, 0.4)}`,
            "&:hover": {
              boxShadow: `0 4px 12px ${alpha(BRAND.primary, 0.35)}`,
            },
          },
        },
      },
      MuiAppBar: {
        defaultProps: { elevation: 0, color: "inherit" },
        styleOverrides: {
          root: {
            backdropFilter: "saturate(180%) blur(8px)",
            backgroundColor: isLight
              ? "rgba(255,255,255,0.8)"
              : "rgba(20,24,33,0.8)",
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundImage: "none",
            backgroundColor: palette.background.paper,
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { fontWeight: 600 },
          outlined: { borderColor: palette.divider },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            "&:hover": {
              backgroundColor: alpha(BRAND.primary, isLight ? 0.06 : 0.12),
            },
          },
        },
      },
      MuiTextField: {
        defaultProps: { size: "small" },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            backgroundColor: isLight
              ? "rgba(255,255,255,0.6)"
              : "rgba(255,255,255,0.02)",
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            fontSize: 12,
            borderRadius: 8,
            backgroundColor: isLight
              ? "rgba(15,23,42,0.92)"
              : "rgba(233,235,242,0.92)",
            color: isLight ? "#fff" : "#0b0d12",
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: { boxShadow: shadows.pop, borderRadius: 12 },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: { boxShadow: shadows.pop, borderRadius: 16 },
        },
      },
    },
  });

  return theme;
}

// Back-compat default: a static light theme for any direct importers.
const theme = getTheme("light");
export default theme;
