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

interface Props extends AppSidebarProps {
  children: React.ReactNode;
}

export default function AppShell({ children, ...sidebarProps }: Props) {
  return (
    <div className="flex min-h-screen bg-[var(--canvas)]">
      <AppSidebar {...sidebarProps} />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
