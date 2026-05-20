"use client";

import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({ 
  icon: Icon, 
  title, 
  description, 
  action,
  className = "",
  theme = "dark",
}: EmptyStateProps & { theme?: "dark" | "light" }) {
  const isDark = theme === "dark";
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 ${className}`}>
      {Icon && (
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${isDark ? "bg-[var(--canvas)]/5" : "bg-[var(--glass-hover)]"}`}>
          <Icon className={`h-8 w-8 ${isDark ? "text-white/40" : "text-[var(--ink-subtle)]"}`} />
        </div>
      )}
      <h3 className={`text-lg font-semibold mb-2 ${isDark ? "text-white" : "text-[var(--ink)]"}`}>{title}</h3>
      {description && (
        <p className={`text-sm text-center max-w-md mb-6 ${isDark ? "text-white/60" : "text-[var(--ink-subtle)]"}`}>{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className={`px-4 py-2 rounded-2xl text-white transition text-sm font-medium ${isDark ? "bg-[#3351ff] hover:bg-[#4a64ff]" : "bg-black hover:bg-[var(--canvas-muted)]"}`}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}



