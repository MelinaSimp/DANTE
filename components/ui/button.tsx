"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-2xl text-sm font-medium transition-all focus:outline-none disabled:opacity-50 disabled:pointer-events-none h-9 px-6",
  {
    variants: {
      variant: {
        default: "bg-[#3351ff] text-white hover:bg-[#4a64ff] shadow-sm hover:shadow-md",
        secondary: "bg-white text-[#3351ff] border border-[#3351ff]/20 hover:bg-[#3351ff]/5 hover:border-[#3351ff]/30",
        accent: "bg-[#3351ff] text-white hover:bg-[#4a64ff]",
        ghost: "bg-[#3351ff] text-white hover:bg-[#4a64ff] shadow-sm hover:shadow-md",
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
