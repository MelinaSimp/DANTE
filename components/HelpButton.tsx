// components/HelpButton.tsx
"use client";

import clsx from "clsx";
import { HelpCircle } from "lucide-react";
import { useOnboarding } from "@/components/onboarding/OnboardingProvider";

type HelpButtonAppearance = "light" | "dark";

interface HelpButtonProps {
  appearance?: HelpButtonAppearance;
}

export default function HelpButton({ appearance = "light" }: HelpButtonProps) {
  const { showOnboarding } = useOnboarding();
  const isDark = appearance === "dark";

  return (
    <button
      type="button"
      onClick={showOnboarding}
      className={clsx(
        "inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition focus:outline-none",
        isDark
          ? "border border-white/15 bg-[var(--canvas)]/5 text-white hover:bg-[var(--canvas)]/10"
          : "border border-[var(--glass-border)] bg-[var(--canvas)]/80 text-[var(--ink-muted)] hover:bg-[var(--canvas)]"
      )}
    >
      <HelpCircle className="h-4 w-4" />
      <span className="hidden sm:inline">Help</span>
    </button>
  );
}
