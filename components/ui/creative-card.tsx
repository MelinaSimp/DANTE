"use client";

// Creative Card — adapted from ruixenui/creative-card on 21st.dev.
//
// Original is an input card (textarea + send + icon row + pill
// tags). For Drift we generalise it so the same chrome can wrap
// arbitrary children — the hover preview, the Dante-noticed
// signals, the chat input — without importing the input-specific
// markup wherever we want the aesthetic.
//
// What's kept verbatim from the original:
//   - rounded-2xl outer with p-[2px] gradient padding ring
//   - small white radial glow at top-left
//   - rounded-xl inner with bg-white/20 (light) / bg-black/50 (dark)
//     and border-gray-200/800
//   - subtle hover/active transitions on inner controls
//
// What's generalised:
//   - children prop instead of fixed textarea + submit + icons
//   - tags optional, render below if provided
//   - className for layout overrides per use site

import React from "react";

interface CreativeCardProps {
  children: React.ReactNode;
  /** Pill tags rendered below the card body. Optional. */
  tags?: string[];
  /** Called when a tag is clicked — e.g. starter-prompt selection. */
  onTagClick?: (tag: string) => void;
  /** Layout overrides for the outer container (max-width, etc.). */
  className?: string;
  /**
   * Solid mode — opaque background + heavier shadow. Use when the
   * card is inside a modal / popover that should clearly sit on top
   * of the page (Cmd+D Ask Dante, EntityHoverCard expanded state).
   * The default semi-transparent look is right for inline usage
   * where the card visually overlaps an entity in the page.
   */
  solid?: boolean;
}

const CreativeCard: React.FC<CreativeCardProps> = ({
  children,
  tags,
  onTagClick,
  className,
  solid = false,
}) => {
  return (
    <div
      className={`flex flex-col items-center mx-auto w-full ${
        className || "max-w-[350px]"
      }`}
    >
      <div className="relative flex flex-col rounded-2xl p-[2px] overflow-hidden w-full">
        {/* Glow effect at top-left — the Creative Card's signature */}
        <div className="pointer-events-none absolute -top-2 -left-2 w-8 h-8 rounded-full bg-gradient-radial from-white via-white/30 via-white/10 to-transparent blur-sm" />

        {/* Body */}
        <div
          className={`flex flex-col rounded-xl w-full overflow-hidden border ${
            solid
              ? "bg-[var(--canvas)] dark:bg-[var(--canvas)] border-[var(--rule)] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.45),0_8px_16px_-4px_rgba(0,0,0,0.25)]"
              : "dark:bg-black/50 bg-white/40 backdrop-blur-sm border-gray-200 dark:border-gray-800 shadow-sm"
          }`}
        >
          {children}
        </div>

        {/* Tags */}
        {tags && tags.length > 0 && (
          <div className="flex gap-2 text-gray-900 dark:text-white text-xs py-3 flex-wrap">
            {tags.map((tag, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onTagClick?.(tag)}
                className="px-2 py-1 bg-white dark:bg-black border border-gray-300 dark:border-gray-800 rounded-lg cursor-pointer select-none transition-colors hover:bg-gray-50 dark:hover:bg-gray-900"
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CreativeCard;
