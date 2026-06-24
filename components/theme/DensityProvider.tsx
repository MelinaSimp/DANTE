"use client";

// DensityProvider — display-density preference (Comfortable / Large).
//
// Sibling to ThemeProvider. Lives in its own file because density
// is orthogonal to theme (a user can want dark + large, light +
// large, etc.) and conflating them would force one big provider
// that does two unrelated things.
//
// Storage: localStorage["drift-density"] = "compact" | "comfortable" | "large"
// Class:   <html class="density-large"> (17.5px) or "density-compact"
//          (13px); "comfortable" (16px) is the unclassed default.
// CSS:     globals.css scales the html font-size under those classes
//          so all rem-based Tailwind text-* classes grow/shrink
//          proportionally.
//
// Why this exists, per the panel-review brief: the older RIA buyer
// is often 55-70+ and reads the screen at arm's length with
// progressive lenses. The default 16px base is fine for designers;
// it's marginal at best for a 65-year-old principal. Giving them a
// one-click bump to a more readable size — without forcing it on
// users who don't need it — is the audience-respect move.

import * as React from "react";

export type Density = "compact" | "comfortable" | "large";

const STORAGE_KEY = "drift-density";

interface DensityContextValue {
  density: Density;
  setDensity: (next: Density) => void;
}

const DensityContext = React.createContext<DensityContextValue | null>(null);

function readStoredDensity(): Density {
  if (typeof window === "undefined") return "comfortable";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "compact" || raw === "comfortable" || raw === "large") return raw;
  } catch {
    // localStorage may throw in private mode / sandboxed iframes.
  }
  return "comfortable";
}

function applyDensity(density: Density) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("density-large", density === "large");
  root.classList.toggle("density-compact", density === "compact");
}

export function DensityProvider({ children }: { children: React.ReactNode }) {
  const [density, setDensityState] = React.useState<Density>(() =>
    readStoredDensity(),
  );

  const setDensity = React.useCallback((next: Density) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore — fallback is in-memory only
    }
    setDensityState(next);
    applyDensity(next);
  }, []);

  const value = React.useMemo(
    () => ({ density, setDensity }),
    [density, setDensity],
  );

  return (
    <DensityContext.Provider value={value}>{children}</DensityContext.Provider>
  );
}

export function useDensity(): DensityContextValue {
  const ctx = React.useContext(DensityContext);
  if (!ctx) {
    return {
      density: "comfortable",
      setDensity: () => undefined,
    };
  }
  return ctx;
}

// Anti-flash inline script. Same pattern as ThemeScript — runs
// blocking in <head> so the .density-large class is on <html>
// before first paint, preventing a font-size jump on hydration.
export function DensityScript() {
  const code = `(function(){try{var s=localStorage.getItem('${STORAGE_KEY}');var c=document.documentElement.classList;if(s==='large')c.add('density-large');else if(s==='compact')c.add('density-compact');}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
