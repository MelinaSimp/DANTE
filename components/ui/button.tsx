"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-2xl text-sm font-medium transition-all focus:outline-none disabled:opacity-50 disabled:pointer-events-none h-9 px-6",
  {
    variants: {
      variant: {
        default: "bg-gradient-to-r from-[#f97316] to-[#fb923c] text-white hover:from-[#ea580c] hover:to-[#f97316] shadow-sm hover:shadow-md",
        secondary: "bg-white text-orange-600 border border-orange-200 hover:bg-orange-50 hover:border-orange-300",
        accent: "bg-gradient-to-r from-[#f97316] to-[#fb923c] text-white hover:from-[#ea580c] hover:to-[#f97316]",
        ghost: "bg-gradient-to-r from-[#f97316] to-[#fb923c] text-white hover:from-[#ea580c] hover:to-[#f97316] shadow-sm hover:shadow-md",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-5 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
