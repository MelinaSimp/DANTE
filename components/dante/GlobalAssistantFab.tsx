"use client";

// GlobalAssistantFab — the always-present "Ask Dante / Ask Vergil"
// button that lives in AppShell so every authenticated page has D/V
// one click away. Mirrors Harvey's pattern of treating the assistant
// as ambient chrome rather than a destination route.
//
// What it does:
//   - Renders a small floating button in the bottom-right corner.
//     Branded per-vertical via useAssistantBrand().
//   - Click opens GlobalSearchModal in Ask mode — same chat surface
//     the ⌘/ shortcut already opens. We deliberately reuse instead of
//     building another panel: one chat UX in the app, not three.
//   - Hides itself on /dante/* (already inside the dedicated chat
//     surface) and on /auth, /onboarding, /download (no session yet).
//
// Why it's a separate component, not just a button in AppSidebar:
// the sidebar is icon-only and on the left edge; a "button at the
// bottom-right that pops a modal" doesn't belong there. AppShell
// composes both — sidebar for navigation, this for assist.

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import GlobalSearchModal from "@/components/shell/GlobalSearchModal";
import { useAssistantBrand } from "./AssistantNameProvider";

// Routes where the FAB would either be redundant (we're already on
// the chat surface) or actively confusing (pre-auth). Match by
// prefix so /dante/chat/[id] is covered without a regex.
const HIDDEN_PREFIXES = [
  "/dante",
  "/auth",
  "/onboarding",
  "/download",
  "/join",
  "/select",
];

export default function GlobalAssistantFab() {
  const { name: assistantName } = useAssistantBrand();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const hidden = pathname
    ? HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
    : false;

  // Hide while the modal is open — the modal itself is the foreground;
  // a button in the corner advertising "open the modal" reads as
  // visual noise once it's already open.
  const showButton = !hidden && !open;

  // Light onboarding nudge — first time the user sees the FAB on a
  // given device, give it a one-shot pulse + tooltip so it's
  // discoverable without a tutorial step. Stored in localStorage.
  const [introShown, setIntroShown] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const seen = localStorage.getItem("drift.fab.introShown");
      if (!seen) {
        setIntroShown(false);
        // Mark seen on first render so a tab-refresh doesn't re-pulse.
        localStorage.setItem("drift.fab.introShown", "1");
      }
    } catch {
      // localStorage blocked — pulse stays off, no-op.
    }
  }, []);

  return (
    <>
      {showButton && (
        <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2">
          {!introShown && (
            <div className="px-3 py-1.5 rounded-[6px] bg-[var(--ink)] text-[var(--canvas)] text-[11px] shadow-lg pointer-events-none animate-fadein">
              Ask {assistantName} — anywhere · ⌘/
            </div>
          )}
          <button
            onClick={() => {
              setOpen(true);
              setIntroShown(true);
            }}
            className="group inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-[var(--ink)] text-[var(--canvas)] shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all"
            aria-label={`Ask ${assistantName}`}
            title={`Ask ${assistantName} · ⌘/`}
          >
            <Sparkles
              className="w-4 h-4"
              strokeWidth={1.5}
              style={
                !introShown
                  ? { animation: "fab-pulse 1.6s ease-in-out 3" }
                  : undefined
              }
            />
            <span className="text-sm font-medium">Ask {assistantName}</span>
          </button>
          <style jsx>{`
            @keyframes fab-pulse {
              0%, 100% { transform: scale(1); opacity: 1; }
              50%      { transform: scale(1.25); opacity: 0.7; }
            }
            .animate-fadein {
              animation: fadein 200ms ease-out;
            }
            @keyframes fadein {
              from { opacity: 0; transform: translateY(4px); }
              to   { opacity: 1; transform: translateY(0); }
            }
          `}</style>
        </div>
      )}

      <GlobalSearchModal
        open={open}
        onClose={() => setOpen(false)}
        initialMode="ask"
      />
    </>
  );
}
