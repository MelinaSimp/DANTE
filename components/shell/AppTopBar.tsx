"use client";

// AppTopBar — minimal header strip. The sidebar now handles primary
// navigation; this just provides the ⌘K/⌘D keyboard shortcuts and
// the GlobalSearchModal. Rendered as a thin, borderless strip that
// stays out of the way.

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useAssistantBrand } from "@/components/dante/AssistantNameProvider";
import GlobalSearchModal from "./GlobalSearchModal";
import UpdateAffordance from "@/components/desktop/UpdateAffordance";

export default function AppTopBar() {
  const { name } = useAssistantBrand();
  const [open, setOpen] = useState(false);
  const [initialMode, setInitialMode] = useState<"search" | "ask">("ask");
  const [seedPrompt, setSeedPrompt] = useState<string | undefined>(undefined);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key === "k") {
        if (e.defaultPrevented) return;
        e.preventDefault();
        setSeedPrompt(undefined);
        setInitialMode("search");
        setOpen(true);
      } else if (e.key === "/" || e.key === "d") {
        if (e.defaultPrevented) return;
        e.preventDefault();
        setSeedPrompt(undefined);
        setInitialMode("ask");
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    function onOpenAsk(e: Event) {
      const detail = (e as CustomEvent<{ prompt?: string }>).detail;
      setSeedPrompt(detail?.prompt);
      setInitialMode("ask");
      setOpen(true);
    }
    window.addEventListener("drift:open-ask", onOpenAsk);
    return () => window.removeEventListener("drift:open-ask", onOpenAsk);
  }, []);

  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    if (typeof navigator !== "undefined") {
      setIsMac(/Mac|iPad|iPhone/.test(navigator.platform || navigator.userAgent || ""));
    }
  }, []);
  const shortcutHint = isMac ? "⌘ D" : "Ctrl D";

  return (
    <>
      <header
        className="relative z-10 flex items-center justify-end gap-3 px-5 py-3"
        aria-label="Page header"
      >
        <UpdateAffordance />

        {/* Search trigger */}
        <button
          type="button"
          onClick={() => {
            setSeedPrompt(undefined);
            setInitialMode("search");
            setOpen(true);
          }}
          className="inline-flex items-center gap-2 glass-input px-3 py-1.5 text-sm text-[var(--ink-subtle)] hover:text-[var(--ink-muted)] transition-colors cursor-pointer"
          aria-keyshortcuts={isMac ? "Meta+K" : "Control+K"}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <span>Search</span>
          <span className="ml-2 text-[11px] opacity-40 font-mono" aria-hidden="true">
            {isMac ? "⌘ K" : "Ctrl K"}
          </span>
        </button>

        {/* Ask assistant — primary CTA (solid dark, highest contrast element) */}
        <button
          type="button"
          onClick={() => {
            setSeedPrompt(undefined);
            setInitialMode("ask");
            setOpen(true);
          }}
          className="inline-flex items-center gap-2 rounded-[10px] bg-[rgba(20,20,22,0.92)] text-white px-4 py-1.5 text-sm font-medium transition hover:bg-[rgba(20,20,22,0.82)] active:scale-[0.98]"
          aria-keyshortcuts={isMac ? "Meta+D" : "Control+D"}
          aria-label={`Ask ${name}`}
        >
          <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} />
          <span>Ask {name}</span>
        </button>
      </header>

      <GlobalSearchModal
        open={open}
        onClose={() => setOpen(false)}
        initialMode={initialMode}
        seedPrompt={seedPrompt}
      />
    </>
  );
}
