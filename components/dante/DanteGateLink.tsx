// components/dante/DanteGateLink.tsx
//
// The gate is the visual entry point to Dante. It appears in three
// places:
//
//   - nav-primary: the dashboard top nav. Clicking this triggers the
//     "passing through" overlay animation before navigating to /dante,
//     because this is the advisor's first arrival into the sub-app and
//     it should feel like crossing a threshold.
//
//   - breadcrumb: inside /dante/* subpages, rendered as a tiny gate +
//     "Dante" text link back to the Dante landing. No animation — the
//     advisor is already inside, they're just stepping back one level.
//
//   - breadcrumb-static: same as breadcrumb but for the /dante landing
//     itself, where "Dante" is where you are, not a destination. Renders
//     as an emphasized label, not a link.
//
// The animation uses framer-motion (already a dep). Total duration
// ~800ms with ease-out — slow enough to read as a deliberate threshold
// crossing rather than a flicker, fast enough that it doesn't feel
// laggy. If the advisor clicks mid-animation we ignore the click
// (guarded by the `opening` flag) so double-clicks don't double-navigate.

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

type Variant = "nav-primary" | "breadcrumb" | "breadcrumb-static";

interface DanteGateLinkProps {
  variant?: Variant;
  className?: string;
  href?: string;
  label?: string;
}

const GATE_SRC = "/brand/dante-double-gate-black.png";

export default function DanteGateLink({
  variant = "nav-primary",
  className = "",
  href = "/dante",
  label = "Dante",
}: DanteGateLinkProps) {
  const router = useRouter();
  const [opening, setOpening] = useState(false);

  // Size + text styling per variant. Kept as a lookup instead of a chain
  // of ternaries so it's trivial to tweak a single variant later.
  const styles = {
    "nav-primary": {
      wrapper: "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] text-sm text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition group",
      iconSize: 18,
      iconClass: "transition-transform group-hover:scale-110 group-hover:drop-shadow-[0_0_6px_rgba(0,0,0,0.2)]",
      textClass: "",
    },
    breadcrumb: {
      wrapper: "inline-flex items-center gap-1 text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] transition",
      iconSize: 12,
      iconClass: "opacity-80",
      textClass: "",
    },
    "breadcrumb-static": {
      wrapper: "inline-flex items-center gap-1 text-xs text-[var(--ink)]",
      iconSize: 12,
      iconClass: "",
      textClass: "font-medium",
    },
  } as const;

  const s = styles[variant];

  // Prefetch aggressively — the overlay animation runs in parallel with
  // the actual route load, so by the time we call router.push the new
  // page is usually ready, giving the transition a seamless feel.
  const handleMouseEnter = () => {
    router.prefetch(href);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (variant !== "nav-primary") return; // only the primary entry animates
    if (opening) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    setOpening(true);
    router.prefetch(href);
    // Kick navigation slightly before the overlay peak so the page
    // render happens while the gate is still growing — cuts perceived
    // latency vs. waiting the full 800ms then navigating.
    window.setTimeout(() => {
      router.push(href);
    }, 680);
  };

  const content = (
    <>
      <img
        src={GATE_SRC}
        alt={variant === "breadcrumb-static" ? "Dante" : ""}
        width={s.iconSize}
        height={s.iconSize}
        style={{ width: s.iconSize, height: s.iconSize }}
        className={`object-contain ${s.iconClass}`}
      />
      <span className={s.textClass}>{label}</span>
    </>
  );

  return (
    <>
      {variant === "breadcrumb-static" ? (
        <span className={`${s.wrapper} ${className}`}>{content}</span>
      ) : (
        <Link
          href={href}
          onMouseEnter={handleMouseEnter}
          onClick={handleClick}
          className={`${s.wrapper} ${className}`}
        >
          {content}
        </Link>
      )}

      {/* Passing-through overlay. Only mounted while a transition is in
          flight. Portals via fixed positioning — covers the whole
          viewport with a canvas-tinted backdrop, with the gate scaling
          up from small to hero-size and fading out just as the new
          route mounts. */}
      <AnimatePresence>
        {opening && (
          <motion.div
            key="dante-gate-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none bg-[var(--canvas)]/85 backdrop-blur-sm"
            aria-hidden="true"
          >
            <motion.img
              src={GATE_SRC}
              alt=""
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: 1.6, opacity: 1 }}
              exit={{ scale: 2.4, opacity: 0 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="w-48 h-48 object-contain"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
