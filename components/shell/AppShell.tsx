"use client";

// AppShell — wraps every authenticated page. Renders the persistent
// left sidebar + main content region. Pages slot their own content
// in via children; AppShell handles the chrome.
//
// Usage:
//   <AppShell
//     workspaceName={workspace.name}
//     industry={workspace.industry}
//     features={workspace.features}
//     isSuperadmin={isSuperadmin}
//   >
//     <YourPageContent />
//   </AppShell>
//
// On screens narrower than lg (< 1024px) the sidebar hides itself and
// pages render full-width. A top mobile nav lands in a follow-up.

import AppSidebar, { type AppSidebarProps } from "./AppSidebar";
import { AssistantNameProvider } from "@/components/dante/AssistantNameProvider";
import { getIndustryConfig } from "@/lib/industry/config";

interface Props extends AppSidebarProps {
  children: React.ReactNode;
}

export default function AppShell({ children, ...sidebarProps }: Props) {
  // Hoist the assistant brand to every authenticated page, not just
  // /dante/*. ContextualAskPanel and any future surface that wants
  // to address D/V by their per-vertical name can just useAssistantBrand().
  const brand = getIndustryConfig(sidebarProps.industry);
  return (
    <AssistantNameProvider
      name={brand.assistantName}
      iconPath={brand.assistantIconPath}
    >
      <div className="flex min-h-screen bg-[var(--canvas)]">
        <AppSidebar {...sidebarProps} />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </AssistantNameProvider>
  );
}
