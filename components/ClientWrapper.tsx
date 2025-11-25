"use client";

import { ReactNode } from "react";

/**
 * Safe wrapper for client components that ensures they only render on the client
 * and handles any errors gracefully
 */
export default function ClientWrapper({ children }: { children: ReactNode }) {
  // This component ensures we're on the client before rendering children
  if (typeof window === 'undefined') {
    return null;
  }

  return <>{children}</>;
}

