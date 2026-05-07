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
import AppTopBar from "./AppTopBar";
import { AssistantNameProvider } from "@/components/dante/AssistantNameProvider";
import { PageContextProvider } from "@/components/dante/PageContext";
import { getIndustryConfig } from "@/lib/industry/config";
import UsageBanner from "@/components/usage/UsageBanner";

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
      {/* PageContextProvider lets every page register what it's about
       *  (entity, list, search). The existing ⌘D Ask mode reads from
       *  this so a question typed on /properties/[id] is automatically
       *  scoped to that property — no separate dock or floating orb
       *  needed; the summon affordance the user already knows just
       *  becomes page-aware. */}
      <PageContextProvider>
        <div className="flex min-h-screen bg-[var(--canvas)]">
          <AppSidebar {...sidebarProps} />
          <div className="flex-1 min-w-0 flex flex-col">
            {/* UsageBanner self-hides unless the workspace has
                crossed an AI-allowance threshold; sticky-top so it
                doesn't push layout when absent. */}
            <UsageBanner />
            {/* AppTopBar gives every page a labeled "Ask Dante"
                button that's visible without keyboard knowledge.
                The sidebar's icon-only search affordance stays for
                power users; this strip is the discoverable one for
                everyone else. */}
            <AppTopBar />
            <main className="flex-1 min-w-0">{children}</main>
          </div>
        </div>
      </PageContextProvider>
    </AssistantNameProvider>
  );
}
