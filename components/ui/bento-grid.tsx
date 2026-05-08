"use client";

// Bento grid + bento card primitives. Adapted from Magic UI's Bento
// pattern, simplified to fit Drift's Harvey-flat design language: no
// framer-motion hover animations, no decorative background elements.
// Just a CSS grid with variably-sized cards using existing
// --canvas / --ink / --rule tokens.
//
// Usage:
//
//   <BentoGrid>
//     <BentoCard label="Today" className="md:col-span-2 md:row-span-2">
//       …
//     </BentoCard>
//     <BentoCard label="Awaiting review" className="md:col-span-1">
//       …
//     </BentoCard>
//   </BentoGrid>
//
// On mobile every card collapses to a single column. On md+ the
// col-span / row-span classes drive the bento layout.

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

interface BentoGridProps {
  children: ReactNode;
  className?: string;
  /** Number of columns on md+ screens. Default 3. */
  cols?: 3 | 4 | 6;
}

const COL_CLASS = {
  3: "md:grid-cols-3",
  4: "md:grid-cols-4",
  6: "md:grid-cols-6",
} as const;

export function BentoGrid({ children, className, cols = 3 }: BentoGridProps) {
  return (
    <div
      className={`grid grid-cols-1 ${COL_CLASS[cols]} gap-3 auto-rows-[minmax(180px,auto)] ${className || ""}`}
    >
      {children}
    </div>
  );
}

interface BentoCardProps {
  children: ReactNode;
  className?: string;
  /** Section eyebrow (small uppercase mono label). */
  label?: string;
  /** Tile heading shown next to the eyebrow. */
  title?: string;
  /** Optional icon next to the eyebrow. */
  icon?: ReactNode;
  /** When set, an "Open" arrow link appears in the corner on hover
   *  and the card itself gains a soft hover state. */
  href?: string;
  /** Tone changes the border/background subtly — used for alert
   *  cards (flagged clients) so they read differently from neutral
   *  data cards. */
  tone?: "default" | "alert";
}

export function BentoCard({
  children,
  className,
  label,
  title,
  icon,
  href,
  tone = "default",
}: BentoCardProps) {
  // Borders: alert tone keeps the warm flag color so attention cards
  // still read distinct; default tone goes solid black at full opacity
  // for a sharper editorial look — paired with a small drop shadow
  // so the cards lift off the canvas instead of dissolving into it.
  const borderTone =
    tone === "alert" ? "border-[var(--flag)]/40" : "border-[var(--ink)]";
  const bgTone = "bg-[var(--canvas)]";
  const shadow = "shadow-[0_1px_2px_rgba(20,20,20,0.06),0_4px_12px_-6px_rgba(20,20,20,0.10)]";
  const hoverShadow = "hover:shadow-[0_2px_4px_rgba(20,20,20,0.08),0_8px_20px_-8px_rgba(20,20,20,0.14)]";

  return (
    <div
      className={`relative group rounded-[6px] border ${borderTone} ${bgTone} ${shadow} ${hoverShadow} transition p-5 flex flex-col overflow-hidden ${className || ""}`}
    >
      {(label || title) && (
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <div className="min-w-0">
            {label && (
              <div className="flex items-center gap-1.5 text-[10px] mono uppercase tracking-wider text-[var(--ink-subtle)] mb-1">
                {icon && (
                  <span className="text-[var(--ink-muted)] inline-flex items-center">
                    {icon}
                  </span>
                )}
                <span>{label}</span>
              </div>
            )}
            {title && (
              <h2 className="text-base font-semibold text-[var(--ink)] truncate">
                {title}
              </h2>
            )}
          </div>
          {href && (
            <Link
              href={href}
              className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-1 text-[11px] text-[var(--accent)] hover:underline whitespace-nowrap transition-opacity shrink-0"
            >
              Open
              <ArrowUpRight className="w-3 h-3" strokeWidth={1.5} />
            </Link>
          )}
        </div>
      )}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
