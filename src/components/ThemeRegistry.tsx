"use client";

import * as React from "react";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { getTheme, type ColorMode } from "@/theme";

const STORAGE_KEY = "lucy-color-mode";

interface ColorModeCtx {
  mode: ColorMode;
  toggle: () => void;
  setMode: (m: ColorMode) => void;
}

const ColorModeContext = React.createContext<ColorModeCtx>({
  mode: "light",
  toggle: () => {},
  setMode: () => {},
});

/** Read + control the current light/dark mode from anywhere in the app. */
export function useColorMode(): ColorModeCtx {
  return React.useContext(ColorModeContext);
}

/**
 * Inline script that runs before React hydrates: reads the saved mode (or the
 * OS preference) and stamps it on <html data-mode> so the very first paint uses
 * the right palette — no flash of the wrong theme.
 */
export function ColorModeScript() {
  const js = `(function(){try{var m=localStorage.getItem('${STORAGE_KEY}');if(!m){m=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-mode',m);}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}

export default function ThemeRegistry({
  children,
}: {
  children: React.ReactNode;
}) {
  // Start from whatever the inline script stamped on <html>, falling back to
  // light. Reading during the initializer keeps SSR and first client render in
  // agreement.
  const [mode, setModeState] = React.useState<ColorMode>(() => {
    if (typeof document !== "undefined") {
      const attr = document.documentElement.getAttribute("data-mode");
      if (attr === "dark" || attr === "light") return attr;
    }
    return "light";
  });

  const setMode = React.useCallback((m: ColorMode) => {
    setModeState(m);
    try {
      localStorage.setItem(STORAGE_KEY, m);
    } catch {
      /* ignore */
    }
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-mode", m);
    }
  }, []);

  const toggle = React.useCallback(
    () => setMode(mode === "light" ? "dark" : "light"),
    [mode, setMode],
  );

  const theme = React.useMemo(() => getTheme(mode), [mode]);
  const ctx = React.useMemo(
    () => ({ mode, toggle, setMode }),
    [mode, toggle, setMode],
  );

  return (
    <ColorModeContext.Provider value={ctx}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}
