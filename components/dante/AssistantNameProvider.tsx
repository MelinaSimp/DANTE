"use client";

// Provides the per-workspace assistant brand name (Dante for FA, Vergil
// for RE) to every component under /dante/*. Lives at the layout level
// so the six sub-page breadcrumbs can read it without each parent
// server page having to fetch + thread the prop down.

import { createContext, useContext, type ReactNode } from "react";

const AssistantNameContext = createContext<string>("Dante");

export function AssistantNameProvider({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) {
  return (
    <AssistantNameContext.Provider value={name}>
      {children}
    </AssistantNameContext.Provider>
  );
}

export function useAssistantName(): string {
  return useContext(AssistantNameContext);
}
