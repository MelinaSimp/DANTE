"use client";

import { ThemeProvider } from "@/app/gigaai/ThemeProvider";

export default function BackendPanelWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <div className="h-full" style={{ background: "#1a1a1a" }}>
        {children}
      </div>
    </ThemeProvider>
  );
}
