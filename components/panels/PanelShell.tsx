"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface PanelShellProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  dark?: boolean;
  accentColor?: string;
}

export default function PanelShell({ title, onClose, children, wide = false, dark = false, accentColor }: PanelShellProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const headerGradient = accentColor
    ? dark
      ? `linear-gradient(180deg, ${accentColor}15 0%, transparent 100%)`
      : `linear-gradient(180deg, ${accentColor}12 0%, transparent 100%)`
    : undefined;

  // Light mode uses Harvey tokens (flat canvas, rule border, 6px radii).
  // Dark mode is preserved for the backend orb which still runs on the
  // old GLSL-wave canvas.
  return (
    <>
      <style>{`@keyframes panelSlideUp { from { opacity: 0; transform: translateY(16px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }`}</style>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
          className={`absolute inset-0 transition-opacity duration-300 ${
            dark ? "bg-black/60 backdrop-blur-2xl" : "bg-[var(--ink)]/20"
          }`}
          onClick={onClose}
        />

        <div
          ref={panelRef}
          style={{ animation: "panelSlideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1)" }}
          className={`relative z-10 flex flex-col overflow-hidden ${
            wide ? "w-[94vw] h-[90vh]" : "w-[88vw] max-w-5xl h-[82vh]"
          } ${
            dark
              ? "rounded-3xl shadow-2xl backdrop-blur-xl bg-[#1a1a1a]/90 border border-white/10"
              : "rounded-[6px] shadow-xl bg-[var(--canvas)] border border-[var(--rule)]"
          }`}
        >
          {/* Header with optional accent gradient wash (dark only) */}
          <div
            className={`flex items-center justify-between px-6 py-4 shrink-0 ${
              dark ? "border-b border-white/10" : "border-b border-[var(--rule)]"
            }`}
            style={dark && headerGradient ? { background: headerGradient } : undefined}
          >
            <div className="flex items-center gap-3">
              {accentColor && (
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={
                    dark
                      ? { backgroundColor: accentColor, boxShadow: `0 0 8px ${accentColor}60` }
                      : { backgroundColor: accentColor }
                  }
                />
              )}
              <h2
                className={`text-lg font-semibold ${
                  dark ? "text-white" : "text-[var(--ink)]"
                }`}
              >
                {title}
              </h2>
            </div>
            <button
              onClick={onClose}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                dark
                  ? "bg-[var(--canvas)]/10 hover:bg-[var(--canvas)]/20"
                  : "hover:bg-[var(--canvas-subtle)]"
              }`}
            >
              <X
                className={`w-4 h-4 ${dark ? "text-[var(--ink-subtle)]" : "text-[var(--ink-muted)]"}`}
                strokeWidth={1.5}
              />
            </button>
          </div>

          <div
            className={`flex-1 overflow-auto ${dark ? "" : "bg-[var(--canvas)]"}`}
          >
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
