"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-2xl text-sm font-medium transition-all focus:outline-none disabled:opacity-50 disabled:pointer-events-none h-9 px-6",
  {
    variants: {
      variant: {
        default: "bg-[#3166bf] text-white hover:bg-[#2a5aa8] shadow-sm hover:shadow-md",
        secondary: "bg-[#f3f4f6] text-[#151515] border border-[#e5e7eb] hover:bg-[#e5e7eb] hover:border-[#d1d5db]",
        accent: "bg-[#3166bf] text-white hover:bg-[#2a5aa8]",
        ghost: "bg-transparent text-[#3166bf] hover:bg-[#3166bf]/10",
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
