"use client";

// AppShell — wraps every authenticated page. Mike-style layout:
// persistent left sidebar + main content region. No top bar —
// the sidebar handles all navigation.

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
  const brand = getIndustryConfig(sidebarProps.industry);
  return (
    <AssistantNameProvider
      name={brand.assistantName}
      iconPath={brand.assistantIconPath}
    >
      <PageContextProvider>
        <div className="h-dvh bg-[var(--canvas)] flex">
          <AppSidebar {...sidebarProps} />
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            <UsageBanner />
            <AppTopBar />
            <main className="flex-1 min-w-0 overflow-auto">{children}</main>
          </div>
        </div>
      </PageContextProvider>
    </AssistantNameProvider>
  );
}
