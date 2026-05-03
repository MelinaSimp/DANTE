"use client";

// ThemeProvider — light / dark / system theme management for Drift.
//
// Why we don't use next-themes: it's a fine library, but the surface
// area we need is small (one preference, one class on <html>, one
// localStorage key) and our anti-flash script is more reliable when
// it lives next to the rest of our layout code. One file, no dep.
//
// Storage: localStorage["drift-theme"] = "light" | "dark" | "system"
// Class: <html class="dark"> when resolved theme is dark
// Anti-flash: see <ThemeScript /> below — must render in <head> before
//   the body so the .dark class is set BEFORE first paint. React state
//   then reads the same source on hydration without a mismatch.

import * as React from "react";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "drift-theme";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (next: Theme) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // localStorage may throw in private mode / sandboxed iframes.
  }
  return "system";
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolve(theme: Theme): ResolvedTheme {
  if (theme === "system") return systemPrefersDark() ? "dark" : "light";
  return theme;
}

function applyTheme(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (resolved === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Initial state matches what the anti-flash script wrote — reading
  // localStorage here is fine because the provider is a client component.
  const [theme, setThemeState] = React.useState<Theme>(() => readStoredTheme());
  const [resolvedTheme, setResolvedTheme] = React.useState<ResolvedTheme>(() =>
    resolve(readStoredTheme()),
  );

  // Track system changes when the user picks "system".
  React.useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const next: ResolvedTheme = mq.matches ? "dark" : "light";
      setResolvedTheme(next);
      applyTheme(next);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = React.useCallback((next: Theme) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore — fallback is in-memory only
    }
    const r = resolve(next);
    setThemeState(next);
    setResolvedTheme(r);
    applyTheme(r);
  }, []);

  const value = React.useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    // Be defensive — outside the provider we still want a working hook
    // (e.g. in error boundaries or tests). Defaults to "system" / light.
    return {
      theme: "system",
      resolvedTheme: "light",
      setTheme: () => undefined,
    };
  }
  return ctx;
}

// Anti-flash inline script. Render once, in <head>, before any styled
// markup. It reads localStorage + system preference and stamps .dark on
// <html> synchronously so the first paint already has the right vars.
//
// Keep this minimal — it runs blocking on every page load.
export function ThemeScript() {
  const code = `(function(){try{var s=localStorage.getItem('${STORAGE_KEY}');var sys=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;var d=s==='dark'||(s!=='light'&&sys);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
