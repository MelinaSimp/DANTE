"use client";

// Stagger — small Framer Motion wrapper for the canonical Drift
// entrance animation: 50ms stagger, 200ms fade-up, ease-out-quart.
// Caps at the first ~10 items so long lists don't make the tail
// feel slow. Respects prefers-reduced-motion.
//
// Usage:
//   <StaggerContainer>
//     <StaggerItem>{card}</StaggerItem>
//     <StaggerItem>{card}</StaggerItem>
//   </StaggerContainer>

import * as React from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";

const STAGGER_DELAY = 0.05;
const STAGGER_CAP = 10;

const containerVariants = (reduce: boolean): Variants => ({
  hidden: { opacity: 1 },
  show: {
    opacity: 1,
    transition: reduce
      ? { staggerChildren: 0 }
      : { staggerChildren: STAGGER_DELAY, delayChildren: 0.04 },
  },
});

const itemVariants = (reduce: boolean): Variants => ({
  hidden: reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: reduce
      ? { duration: 0 }
      : { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
  },
});

export function StaggerContainer({
  children,
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: React.ElementType;
}) {
  const reduce = useReducedMotion() ?? false;
  const childArray = React.Children.toArray(children);
  if (childArray.length <= STAGGER_CAP) {
    return (
      <motion.div
        className={className}
        variants={containerVariants(reduce)}
        initial="hidden"
        animate="show"
      >
        {children}
      </motion.div>
    );
  }
  // Long lists: stagger the first STAGGER_CAP, render the rest plain.
  const head = childArray.slice(0, STAGGER_CAP);
  const tail = childArray.slice(STAGGER_CAP);
  return (
    <Tag className={className}>
      <motion.div
        variants={containerVariants(reduce)}
        initial="hidden"
        animate="show"
        style={{ display: "contents" }}
      >
        {head}
      </motion.div>
      {tail}
    </Tag>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion() ?? false;
  return (
    <motion.div className={className} variants={itemVariants(reduce)}>
      {children}
    </motion.div>
  );
}
