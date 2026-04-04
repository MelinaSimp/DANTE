"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface PanelShellProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  dark?: boolean;
}

export default function PanelShell({ title, onClose, children, wide = false, dark = false }: PanelShellProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <>
      <style>{`@keyframes panelSlideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
          className={`absolute inset-0 backdrop-blur-2xl transition-opacity duration-300 ${dark ? "bg-black/60" : "bg-black/30"}`}
          onClick={onClose}
        />

        <div
          ref={panelRef}
          style={{ animation: "panelSlideUp 0.3s ease-out" }}
          className={`relative z-10 backdrop-blur-sm rounded-3xl shadow-2xl flex flex-col overflow-hidden ${
            wide ? "w-[94vw] h-[90vh]" : "w-[88vw] max-w-5xl h-[82vh]"
          } ${dark ? "bg-[#1a1a1a]/95 border border-white/10" : "bg-white/95 border border-gray-200/50"}`}
        >
          <div className={`flex items-center justify-between px-6 py-4 shrink-0 ${dark ? "border-b border-white/10" : "border-b border-gray-100"}`}>
            <h2 className={`text-lg font-semibold ${dark ? "text-white" : "text-gray-900"}`}>{title}</h2>
            <button
              onClick={onClose}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${dark ? "bg-white/10 hover:bg-white/20" : "bg-gray-100 hover:bg-gray-200"}`}
            >
              <X className={`w-4 h-4 ${dark ? "text-gray-400" : "text-gray-600"}`} />
            </button>
          </div>

          <div className="flex-1 overflow-auto">{children}</div>
        </div>
      </div>
    </>
  );
}
