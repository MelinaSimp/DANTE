"use client";

import { useEffect, useRef, useState } from "react";

// useCountUp — rAF-driven number animation. Animates from the previous
// target to the new target so that subsequent updates (polling, data
// refresh) ease smoothly rather than snapping back to 0.
//
// Honors `enabled=false` (e.g. when prefers-reduced-motion is set) by
// snapping to the target immediately.
export function useCountUp(target: number, duration = 600, enabled = true): number {
  const [value, setValue] = useState<number>(enabled ? 0 : target);
  const prevTarget = useRef<number>(0);

  useEffect(() => {
    if (!enabled || !Number.isFinite(target)) {
      setValue(target);
      prevTarget.current = target;
      return;
    }
    let raf = 0;
    const from = prevTarget.current;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // ease-out-quart to match our Tailwind token
      const eased = 1 - Math.pow(1 - t, 4);
      setValue(from + (target - from) * eased);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setValue(target);
        prevTarget.current = target;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, enabled]);

  return value;
}
