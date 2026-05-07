"use client";

// SourceViewerContext — owns the "currently viewing" state for the
// citation source panel. CitationRenderer dispatches openSource()
// when a vault chip is clicked; the layout shell reads the state to
// know whether to render the SourceViewer panel + shrink chat.
//
// One source open at a time. Opening a different citation replaces
// the current one (no history stack — the chat itself IS the
// history; user can click another chip to navigate).

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface SourceTarget {
  documentId: string;
  /** Display-friendly title, shown in the panel header. */
  title: string;
  /** Page number to jump to. 1-indexed. May be null if the citation
   *  doesn't carry a page (older vault items, regulatory hits). */
  page: number | null;
  /** The cited snippet text — used to find + highlight matches in
   *  the rendered text layer. */
  quote: string;
  /** Marker like "[v1]" — shown in the panel header so the user
   *  can correlate with the answer body. */
  marker?: string;
}

interface SourceViewerContextValue {
  active: SourceTarget | null;
  open: (target: SourceTarget) => void;
  close: () => void;
}

const Ctx = createContext<SourceViewerContextValue | null>(null);

export function SourceViewerProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<SourceTarget | null>(null);
  const open = useCallback((target: SourceTarget) => setActive(target), []);
  const close = useCallback(() => setActive(null), []);
  const value = useMemo(() => ({ active, open, close }), [active, open, close]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSourceViewer(): SourceViewerContextValue {
  const v = useContext(Ctx);
  if (!v) {
    // Outside a provider — return a noop so legacy surfaces that
    // haven't been wrapped don't crash. CitationChip will fall back
    // to its old popover behavior in those cases.
    return {
      active: null,
      open: () => {
        /* noop */
      },
      close: () => {
        /* noop */
      },
    };
  }
  return v;
}

/** Convenience: did the user wrap us, or are we falling back to noop? */
export function useHasSourceViewer(): boolean {
  return useContext(Ctx) !== null;
}
