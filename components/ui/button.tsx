"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-2xl text-sm font-medium transition-all focus:outline-none disabled:opacity-50 disabled:pointer-events-none h-9 px-6",
  {
    variants: {
      variant: {
        default: "bg-gradient-to-r from-[#229CF3] to-[#60B2F5] text-white hover:from-[#1E8CE8] hover:to-[#4DA8F4] shadow-sm hover:shadow-md",
        secondary: "bg-white text-blue-600 border border-blue-200 hover:bg-blue-50 hover:border-blue-300",
        accent: "bg-gradient-to-r from-[#229CF3] to-[#60B2F5] text-white hover:from-[#1E8CE8] hover:to-[#4DA8F4]",
        ghost: "bg-gradient-to-r from-[#229CF3] to-[#60B2F5] text-white hover:from-[#1E8CE8] hover:to-[#4DA8F4] shadow-sm hover:shadow-md",
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
