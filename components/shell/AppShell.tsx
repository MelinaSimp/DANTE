"use client";

import AppSidebar, { type AppSidebarProps } from "./AppSidebar";
import AppTopBar from "./AppTopBar";
import IconRail from "./IconRail";

import { AssistantNameProvider } from "@/components/dante/AssistantNameProvider";
import { PageContextProvider } from "@/components/dante/PageContext";
import { getIndustryConfig } from "@/lib/industry/config";
import UsageBanner from "@/components/usage/UsageBanner";

interface Props extends AppSidebarProps {
  children: React.ReactNode;
}

export default function AppShell({ children, ...sidebarProps }: Props) {
  const brand = getIndustryConfig(sidebarProps.industry);

  const initials = (() => {
    const name = sidebarProps.workspaceName || "";
    const words = name.replace(/[^A-Za-z0-9 ]/g, "").trim().split(/\s+/);
    if (words.length === 0) return "?";
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  })();

  return (
    <AssistantNameProvider
      name={brand.assistantName}
      iconPath={brand.assistantIconPath}
    >
      <PageContextProvider>
        {/* Floating-panel shell: icon rail + sidebar + main, all
            inset from the viewport edges with gaps between them so
            the desktop wallpaper / Electron vibrancy shows through. */}
        <div
          className="h-dvh flex"
          style={{
            padding: "var(--shell-gap)",
            gap: "var(--panel-gap)",
          }}
        >
          {/* Dark icon rail — always visible on lg+ */}
          <div className="hidden lg:flex">
            <IconRail initials={initials} />
          </div>

          {/* Frosted sidebar panel */}
          <AppSidebar {...sidebarProps} />

          {/* Frosted main content panel */}
          <div className="glass-panel glass-main flex-1 min-w-0 flex flex-col overflow-hidden">
            <UsageBanner />
            <AppTopBar />
            <main className="flex-1 min-w-0 overflow-auto">{children}</main>
          </div>
        </div>
      </PageContextProvider>
    </AssistantNameProvider>
  );
}
