import * as React from "react";

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  /**
   * Adds hover lift + raised shadow on hover. Use for clickable cards
   * (link cards, button-like surfaces). Don't use for static content
   * cards — the lift implies "this does something" and is a lie if
   * the card has no onClick / wrapping <a>.
   */
  interactive?: boolean;
};

export function Card({
  className = "",
  interactive = false,
  ...props
}: CardProps) {
  const base =
    "glass-card transition-[transform,box-shadow] duration-150 ease-out-quart";
  const hover = interactive
    ? "glass-card-hover hover:-translate-y-0.5 cursor-pointer active:translate-y-0"
    : "";
  return <div className={`${base} ${hover} ${className}`} {...props} />;
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
