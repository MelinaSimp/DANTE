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
        className="relative z-10 flex items-center justify-end gap-3 px-4 md:px-6 py-2"
        aria-label="Page header"
      >
        <UpdateAffordance />
        <button
          type="button"
          onClick={() => {
            setSeedPrompt(undefined);
            setInitialMode("ask");
            setOpen(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-gray-900 text-white px-3.5 py-1.5 text-sm font-medium transition hover:bg-gray-800 active:scale-[0.98]"
          aria-keyshortcuts={isMac ? "Meta+D" : "Control+D"}
          aria-label={`Ask ${name}`}
        >
          <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} />
          <span>Ask {name}</span>
          <span className="ml-1 text-[11px] opacity-50 font-mono" aria-hidden="true">
            {shortcutHint}
          </span>
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
