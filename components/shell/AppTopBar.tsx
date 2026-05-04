"use client";

// AppTopBar — persistent top-of-page strip on every authenticated
// page. Sits above the main content and renders one thing
// prominently: a labeled "Ask Dante" (or Vergil) button with the
// keyboard hint as a secondary cue.
//
// Why this exists, even though the sidebar already has a search icon
// and ⌘K opens the same modal: per the panel review of the older-
// RIA buyer, an icon-only affordance with a hidden keyboard shortcut
// is invisible to the actual user. Diane (62, two-finger typist) has
// never typed ⌘ on purpose. She needs a button that says "Ask Dante"
// in plain language, in the place her eye naturally lands when she
// opens the app.
//
// We deliberately keep the keyboard shortcut working — Jameel (44,
// power user) will use ⌘D and never click this button. Both can win.

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useAssistantBrand } from "@/components/dante/AssistantNameProvider";
import GlobalSearchModal from "./GlobalSearchModal";

export default function AppTopBar() {
  const { name } = useAssistantBrand();
  const [open, setOpen] = useState(false);
  const [initialMode, setInitialMode] = useState<"search" | "ask">("ask");
  const [seedPrompt, setSeedPrompt] = useState<string | undefined>(undefined);

  // Keep the same global keyboard shortcuts working when the user
  // is anywhere on an authenticated page. The sidebar already wires
  // ⌘K / ⌘D / ⌘/ to its own modal; this listener is a fallback in
  // case the sidebar isn't mounted (mobile / narrow viewport).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key === "k") {
        // Don't double-open if the sidebar caught it. Sidebar runs
        // first because it mounts higher; if it called preventDefault
        // we'd never see this.
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

  // Other surfaces (the WhatChanged "Ask Dante what these mean for
  // my book" button, future contextual quick-asks) dispatch
  // `drift:open-ask` with an optional seed prompt. We open the
  // modal in Ask mode and pass the seed through so the user lands
  // on a pre-filled question they can edit or just submit.
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

  // Unread regulatory briefs badge. WhatChanged dispatches
  // `drift:regulatory-unread` on each data load with the current
  // count, so the badge stays in sync as briefs are read or
  // generated. Default to 0 — the badge only renders when > 0.
  const [unreadCount, setUnreadCount] = useState(0);
  useEffect(() => {
    function onUnread(e: Event) {
      const n = (e as CustomEvent<{ count?: number }>).detail?.count ?? 0;
      setUnreadCount(Math.max(0, n));
    }
    window.addEventListener("drift:regulatory-unread", onUnread);
    return () => window.removeEventListener("drift:regulatory-unread", onUnread);
  }, []);

  // Detect platform for the keyboard hint label. macOS / iOS shows
  // ⌘; everywhere else shows Ctrl. Best-effort, runs on mount.
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
        className="sticky top-0 z-30 flex items-center justify-end gap-3 px-4 md:px-8 py-3 border-b border-[var(--rule)] bg-[var(--canvas)]/95 backdrop-blur"
        aria-label="Page header"
      >
        <button
          type="button"
          onClick={() => {
            setSeedPrompt(undefined);
            setInitialMode("ask");
            setOpen(true);
          }}
          className="relative inline-flex items-center gap-2.5 rounded-[6px] border border-[var(--ink)] bg-[var(--ink)] text-[var(--canvas)] px-4 py-2 text-sm font-medium transition hover:opacity-90 active:scale-[0.99]"
          aria-keyshortcuts={isMac ? "Meta+D" : "Control+D"}
          aria-label={
            unreadCount > 0
              ? `Ask ${name}. ${unreadCount} new regulatory finding${unreadCount === 1 ? "" : "s"} from ${name}.`
              : `Ask ${name}`
          }
        >
          <Sparkles className="w-4 h-4" strokeWidth={1.75} />
          <span>Ask {name}</span>
          {unreadCount > 0 && (
            <span
              className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-[var(--accent,#2563eb)] text-[var(--canvas)] text-[11px] font-semibold leading-none"
              title={`${unreadCount} new regulatory finding${unreadCount === 1 ? "" : "s"}`}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
          <span
            className="ml-1 mono text-[11px] opacity-70"
            aria-hidden="true"
          >
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
