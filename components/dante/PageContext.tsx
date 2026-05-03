"use client";

// PageContext — the global "what's the user looking at right now"
// registry. The existing ⌘D Ask mode (GlobalSearchModal) reads from
// this so a question typed on a contact or property detail page is
// automatically scoped to that entity — no separate dock or floating
// orb; the summon affordance the user already knows just becomes
// page-aware. Every authenticated page that has meaningful context
// (an entity it represents, a list it's filtering) registers via
// usePageContext(...) at mount and clears on unmount.
//
// Design rules:
//
//   - One active context per page. The deepest registered wins.
//   - Registration is best-effort. A page that doesn't register just
//     gets a generic "this page" treatment in the dock.
//   - Context is small and serializable — it travels into the agent
//     payload as JSON. Don't park React refs or DOM nodes here.

import * as React from "react";

export type PageEntityKind =
  | "contact"
  | "property"
  | "vault_project"
  | "vault_item"
  | "library_prompt"
  | "audit_event"
  | "appointment"
  | "chat";

export interface PageEntity {
  kind: PageEntityKind;
  id: string;
  /** Display label — name, address, title. */
  label: string;
}

export interface PageContextValue {
  /** Short noun for the page — "Dashboard", "Vault", "Henderson Trust". */
  title: string;
  /** Optional eyebrow like "5 households" / "12 items" / "Realtor". */
  subtitle?: string;
  /** The single primary entity this page is about, when applicable.
   *  Detail pages (contact/property/vault item) set this. Lists leave
   *  it undefined and rely on title+subtitle. */
  entity?: PageEntity;
  /** Up to a few visible entities the user could plausibly be asking
   *  about — list rows, tile cards. Used to give the agent a richer
   *  prior. Capped at 12 by the registrar. */
  visibleEntities?: PageEntity[];
  /** Free-form note — "filter: out-of-band", "search: rmd". */
  hint?: string;
}

interface ContextStore {
  current: PageContextValue | null;
  setCurrent: React.Dispatch<React.SetStateAction<PageContextValue | null>>;
}

const PageContextStore = React.createContext<ContextStore | null>(null);

export function PageContextProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = React.useState<PageContextValue | null>(null);
  const value = React.useMemo<ContextStore>(
    () => ({ current, setCurrent }),
    [current],
  );
  return (
    <PageContextStore.Provider value={value}>
      {children}
    </PageContextStore.Provider>
  );
}

/** Read the current page context. Returns null if no page has registered. */
export function useCurrentPageContext(): PageContextValue | null {
  const store = React.useContext(PageContextStore);
  return store?.current ?? null;
}

/**
 * Register the current page's context with the dock.
 *
 * Pass a stable object (or memoize at the call site) — we don't deep-
 * compare. Pass null to explicitly clear (rare; unmount handles it).
 *
 *   usePageContext({
 *     title: "Henderson Trust",
 *     subtitle: "Trust · since 2018",
 *     entity: { kind: "contact", id, label: "Henderson Trust" },
 *   });
 */
export function usePageContext(value: PageContextValue | null): void {
  const store = React.useContext(PageContextStore);
  React.useEffect(() => {
    if (!store) return;
    // Cap visibleEntities so an over-eager page doesn't ship 500 list
    // rows into the agent prompt budget.
    const capped: PageContextValue | null = value
      ? {
          ...value,
          visibleEntities: value.visibleEntities?.slice(0, 12),
        }
      : null;
    store.setCurrent(capped);
    return () => {
      // Only clear if we're still the active context — prevents a
      // racing unmount from wiping a sibling's registration.
      store.setCurrent((prev) => (prev === capped ? null : prev));
    };
    // Intentionally re-run on every render where value identity changes.
    // Page authors should memoize at the call site if they want stability.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value)]);
}
