"use client";

import React from "react";
import { ErrorBoundary } from "./ErrorBoundary";

export default function ErrorBoundaryWrapper({ children }: { children: React.ReactNode }) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}

