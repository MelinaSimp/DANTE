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

  return (
    <>
      <style>{`@keyframes panelSlideUp { from { opacity: 0; transform: translateY(16px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }`}</style>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
          className={`absolute inset-0 backdrop-blur-2xl transition-opacity duration-300 ${dark ? "bg-black/60" : "bg-black/20"}`}
          onClick={onClose}
        />

        <div
          ref={panelRef}
          style={{ animation: "panelSlideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1)" }}
          className={`relative z-10 backdrop-blur-xl rounded-3xl shadow-2xl flex flex-col overflow-hidden ${
            wide ? "w-[94vw] h-[90vh]" : "w-[88vw] max-w-5xl h-[82vh]"
          } ${dark ? "bg-[#1a1a1a]/90 border border-white/10" : "bg-white/80 border border-white/60"}`}
        >
          {/* Header with optional accent gradient wash */}
          <div
            className={`flex items-center justify-between px-6 py-4 shrink-0 ${dark ? "border-b border-white/10" : "border-b border-gray-200/40"}`}
            style={headerGradient ? { background: headerGradient } : undefined}
          >
            <div className="flex items-center gap-3">
              {accentColor && (
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: accentColor, boxShadow: `0 0 8px ${accentColor}60` }}
                />
              )}
              <h2 className={`text-lg font-semibold ${dark ? "text-white" : "text-gray-900"}`}>{title}</h2>
            </div>
            <button
              onClick={onClose}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${dark ? "bg-white/10 hover:bg-white/20" : "bg-black/5 hover:bg-black/10"}`}
            >
              <X className={`w-4 h-4 ${dark ? "text-gray-400" : "text-gray-500"}`} />
            </button>
          </div>

          <div className={`flex-1 overflow-auto ${dark ? "" : "bg-white/40"}`}>{children}</div>
        </div>
      </div>
    </>
  );
}
