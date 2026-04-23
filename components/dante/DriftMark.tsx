"use client";

// Small Drift logo used throughout Dante to brand AI-initiated actions
// (Rank my book, template insertions, workflow AI steps). Replaces the
// generic Sparkles glyph so the surface feels like *Drift*, not like a
// template AI app. API matches lucide-react's `className` convention so
// it drops in anywhere `<Sparkles className="w-4 h-4" />` appeared.

type Props = {
  className?: string;
};

export function DriftMark({ className = "w-4 h-4" }: Props) {
  return (
    <img
      src="/brand/logo-circle.png"
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`${className} inline-block rounded-full object-cover select-none`}
    />
  );
}
