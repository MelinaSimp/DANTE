import * as React from "react";

type CardProps = React.HTMLAttributes<HTMLDivElement>;

export function Card({ className = "", ...props }: CardProps) {
  return (
    <div
      className={
        "rounded-2xl border border-[#A67B5B]/20 bg-white/70 shadow-sm " + className
      }
      {...props}
    />
  );
}

export function CardContent({ className = "", ...props }: CardProps) {
  return <div className={"p-4 " + className} {...props} />;
}

/** Compatibility helpers used by the marketing grid */
export function CardBody({ className = "", ...props }: CardProps) {
  return <div className={"p-4 " + className} {...props} />;
}
export function CardTitle({ className = "", ...props }: CardProps) {
  return <div className={"text-lg font-semibold mb-1 " + className} {...props} />;
}
export function CardSubtitle({ className = "", ...props }: CardProps) {
  return <div className={"text-sm text-gray-600 mb-2 " + className} {...props} />;
}

export default Card;
