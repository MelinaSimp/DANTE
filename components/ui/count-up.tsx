"use client";

// CountUp — animates a numeric value from its previous render to the
// current target with rAF + ease-out-quart. Handles formatted strings
// like "$1,234,567" and "$50K" by parsing the leading number, animating
// it, and re-stitching prefix/suffix around the formatted result.
//
// Use ONLY for first-paint hero metrics (dashboard KPI cards) — not
// for live-updating numbers in tables or anywhere a user is actively
// reading. Per the panel: animation here helps perceived load; it
// hurts perceived speed everywhere else.

import * as React from "react";
import { useReducedMotion } from "framer-motion";
import { useCountUp } from "@/hooks/useCountUp";

interface CountUpProps {
  value: string | number;
  /** Animation duration in ms. Default 600 (matches our entrance timing). */
  duration?: number;
}

export function CountUp({ value, duration = 600 }: CountUpProps) {
  const reduce = useReducedMotion() ?? false;
  const enabled = !reduce;

  const str = typeof value === "number" ? String(value) : value;

  // Match: optional prefix (currency, sign), numeric body, optional suffix
  // (units like K/M/B/%, free-form trailing text).
  const match = str.match(/^([^\d-]*?)(-?\d[\d,]*\.?\d*)(.*)$/);
  const numStr = match ? match[2] : "";
  const prefix = match ? match[1] : "";
  const suffix = match ? match[3] : "";

  const target = numStr ? parseFloat(numStr.replace(/,/g, "")) : 0;
  const isInteger = numStr ? !numStr.includes(".") : true;
  const hasComma = numStr.includes(",");

  const animated = useCountUp(
    Number.isFinite(target) ? target : 0,
    duration,
    enabled,
  );

  if (!match || !Number.isFinite(target)) {
    return <>{str}</>;
  }

  const display = isInteger
    ? hasComma
      ? Math.round(animated).toLocaleString()
      : String(Math.round(animated))
    : animated.toFixed(1);

  return (
    <>
      {prefix}
      {display}
      {suffix}
    </>
  );
}
