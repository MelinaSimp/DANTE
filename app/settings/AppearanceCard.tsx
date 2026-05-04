"use client";

// AppearanceCard — settings panel for theme + display-density.
//
// Theme: three-way segmented toggle (Light · Dark · System).
// Density: two-way (Comfortable · Large). Density is a per-device
// preference like theme, not a workspace setting — older advisors
// might want larger sizing on their daily desktop while staff on
// the same workspace use comfortable on a larger monitor.

import { Sun, Moon, Monitor, Type } from "lucide-react";
import { useTheme, type Theme } from "@/components/theme/ThemeProvider";
import { useDensity, type Density } from "@/components/theme/DensityProvider";

interface Option {
  value: Theme;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  description: string;
}

const OPTIONS: Option[] = [
  {
    value: "light",
    label: "Light",
    icon: Sun,
    description: "White canvas, dark ink. Best in bright environments.",
  },
  {
    value: "dark",
    label: "Dark",
    icon: Moon,
    description: "Graphite canvas, soft ink. Reduces eye strain at night.",
  },
  {
    value: "system",
    label: "System",
    icon: Monitor,
    description: "Match your operating system's appearance setting.",
  },
];

interface DensityOption {
  value: Density;
  label: string;
  description: string;
}

const DENSITY_OPTIONS: DensityOption[] = [
  {
    value: "comfortable",
    label: "Comfortable",
    description: "Default 16px base. Tighter information density.",
  },
  {
    value: "large",
    label: "Large",
    description: "17.5px base. Easier to read at arm's length.",
  },
];

export default function AppearanceCard() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { density, setDensity } = useDensity();

  return (
    <div className="space-y-6">
      <div>
        <div className="label-section mb-2">Theme</div>
        <div
          role="radiogroup"
          aria-label="Theme preference"
          className="grid grid-cols-3 gap-2"
        >
          {OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = theme === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTheme(opt.value)}
                className={`group flex flex-col items-start gap-2 rounded-[6px] border p-4 text-left transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out-quart active:scale-[0.99] ${
                  active
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-ground"
                    : "border-[var(--rule)] bg-[var(--canvas)] hover:border-[var(--rule-strong)] hover:bg-[var(--canvas-subtle)]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon
                    className={`h-4 w-4 ${
                      active
                        ? "text-[var(--accent)]"
                        : "text-[var(--ink-muted)]"
                    }`}
                    strokeWidth={1.5}
                  />
                  <span
                    className={`text-sm font-medium ${
                      active ? "text-[var(--accent)]" : "text-[var(--ink)]"
                    }`}
                  >
                    {opt.label}
                  </span>
                </div>
                <p className="text-[12px] leading-relaxed text-[var(--ink-muted)]">
                  {opt.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-[6px] border border-[var(--rule)] bg-[var(--canvas-subtle)] px-4 py-3">
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-[var(--ink-muted)]">Currently applied</span>
          <span className="mono text-[var(--ink)]">
            {resolvedTheme}
            {theme === "system" && (
              <span className="text-[var(--ink-subtle)]"> · from system</span>
            )}
          </span>
        </div>
      </div>

      <p className="text-[12px] leading-relaxed text-[var(--ink-muted)]">
        Theme is a per-device preference — it isn&apos;t synced across
        browsers or workspaces. Some legacy surfaces (vault, library,
        dashboard chart panels) are still being migrated and may render
        with light-mode chrome regardless of your selection.
      </p>

      <div className="border-t border-[var(--rule)] pt-6">
        <div className="label-section mb-2">Display size</div>
        <div
          role="radiogroup"
          aria-label="Display density"
          className="grid grid-cols-2 gap-2"
        >
          {DENSITY_OPTIONS.map((opt) => {
            const active = density === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setDensity(opt.value)}
                className={`group flex flex-col items-start gap-2 rounded-[6px] border p-4 text-left transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out-quart active:scale-[0.99] ${
                  active
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-ground"
                    : "border-[var(--rule)] bg-[var(--canvas)] hover:border-[var(--rule-strong)] hover:bg-[var(--canvas-subtle)]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Type
                    className={`h-4 w-4 ${
                      active
                        ? "text-[var(--accent)]"
                        : "text-[var(--ink-muted)]"
                    }`}
                    strokeWidth={1.5}
                  />
                  <span
                    className={`text-sm font-medium ${
                      active ? "text-[var(--accent)]" : "text-[var(--ink)]"
                    }`}
                  >
                    {opt.label}
                  </span>
                </div>
                <p className="text-[12px] leading-relaxed text-[var(--ink-muted)]">
                  {opt.description}
                </p>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-[var(--ink-muted)]">
          Display size scales most text proportionally. Per-device, not
          synced. Pick Large if you read the screen at arm&apos;s length
          or share the desktop with someone who does.
        </p>
      </div>
    </div>
  );
}
