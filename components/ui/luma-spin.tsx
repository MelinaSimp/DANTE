// components/ui/luma-spin.tsx
//
// Geometric loading spinner — two overlapping rounded rectangles
// rotating through inset keyframes. Used as the "Working..." indicator
// in the Dante chat surface.

interface LumaSpinProps {
  /** Pixel size of the container (square). Defaults to 18. */
  size?: number;
  className?: string;
}

export function LumaSpin({ size = 18, className = "" }: LumaSpinProps) {
  // The keyframe inset values scale proportionally with size.
  // Original animation is designed for 65px with 35px inset offsets,
  // so we derive the offset as (35/65) of the given size.
  const offset = Math.round((35 / 65) * size);

  return (
    <div
      className={`relative ${className}`}
      style={{ width: size, height: size }}
    >
      <span
        className="absolute rounded-[50px] shadow-[inset_0_0_0_2px] shadow-current"
        style={{
          animation: `lumaSpin ${2.5}s infinite`,
        }}
      />
      <span
        className="absolute rounded-[50px] shadow-[inset_0_0_0_2px] shadow-current"
        style={{
          animation: `lumaSpin ${2.5}s infinite`,
          animationDelay: "-1.25s",
        }}
      />
      <style>{`
        @keyframes lumaSpin {
          0%     { inset: 0 ${offset}px ${offset}px 0; }
          12.5%  { inset: 0 ${offset}px 0 0; }
          25%    { inset: ${offset}px ${offset}px 0 0; }
          37.5%  { inset: ${offset}px 0 0 0; }
          50%    { inset: ${offset}px 0 0 ${offset}px; }
          62.5%  { inset: 0 0 0 ${offset}px; }
          75%    { inset: 0 0 ${offset}px ${offset}px; }
          87.5%  { inset: 0 0 ${offset}px 0; }
          100%   { inset: 0 ${offset}px ${offset}px 0; }
        }
      `}</style>
    </div>
  );
}
