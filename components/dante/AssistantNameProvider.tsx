"use client";

// Provides the per-workspace assistant brand (name + icon path) to every
// component under /dante/*. Lives at the layout level so the sub-page
// breadcrumbs can read it without each parent server page having to
// fetch + thread the prop down.

import { createContext, useContext, type ReactNode } from "react";

interface AssistantBrand {
  name: string;
  iconPath: string;
}

const DEFAULT_BRAND: AssistantBrand = {
  name: "Dante",
  iconPath: "/brand/dante-sword.png",
};

const AssistantBrandContext = createContext<AssistantBrand>(DEFAULT_BRAND);

export function AssistantNameProvider({
  name,
  iconPath,
  children,
}: {
  name: string;
  iconPath: string;
  children: ReactNode;
}) {
  return (
    <AssistantBrandContext.Provider value={{ name, iconPath }}>
      {children}
    </AssistantBrandContext.Provider>
  );
}

export function useAssistantName(): string {
  return useContext(AssistantBrandContext).name;
}

export function useAssistantBrand(): AssistantBrand {
  return useContext(AssistantBrandContext);
}
