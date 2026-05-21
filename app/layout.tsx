// app/layout.tsx
//
// Root layout. Mike-inspired clean design language:
// white canvas, serif display type (EB Garamond), sans UI (Inter),
// mono for data (JetBrains Mono).

import type { Metadata } from "next";
import { EB_Garamond, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import PushNotificationManager from "@/components/PushNotificationManager";
import OfflineIndicator from "@/components/OfflineIndicator";
import { OnboardingProvider } from "@/components/onboarding/OnboardingProvider";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { ToastProvider } from "@/components/ui/toast";
import { ConfirmDialogProvider } from "@/components/ui/confirm-dialog";
import QueryProvider from "@/lib/query/provider";
import CommandPalette from "@/components/command-palette/CommandPalette";
import WatcherBridge from "@/components/shell/WatcherBridge";
import { ThemeProvider, ThemeScript } from "@/components/theme/ThemeProvider";
import { DensityProvider, DensityScript } from "@/components/theme/DensityProvider";
// FloatingDashboardButton was removed in the IA sweep — every workspace
// page now has an inline "← Dashboard" link at the top, so the floating
// chip was a duplicate affordance. If you need one-off back-chip for a
// specific route, add it in that route, not globally.

const fontUi = Inter({
  subsets: ["latin"],
  variable: "--font-ui-loaded",
  display: "swap",
});
const fontDisplay = EB_Garamond({
  subsets: ["latin"],
  variable: "--font-display-loaded",
  display: "swap",
});
const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Drift — for financial advisors",
  description:
    "Grounded AI for RIAs. Citation-backed summaries, compliance review, client intelligence.",
  manifest: "/manifest.json",
  icons: {
    icon: "/brand/logo-circle.png",
    apple: "/brand/logo-circle.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Drift",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${fontUi.variable} ${fontDisplay.variable} ${fontMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Anti-flash: must run before <body> so the .dark and
         * .density-large classes are on <html> for first paint. See
         * ThemeProvider / DensityProvider for sources. */}
        <ThemeScript />
        <DensityScript />
      </head>
      <body className="min-h-screen antialiased text-[var(--ink)]">
        <ThemeProvider>
        <DensityProvider>
        <QueryProvider>
          <ToastProvider>
            <ConfirmDialogProvider>
              <OnboardingProvider>
                <OfflineIndicator />
                <div className="hidden">
                  <Header />
                </div>
                <ErrorBoundary>
                  <main className="relative z-0">{children}</main>
                </ErrorBoundary>
                <CommandPalette />
                <PushNotificationManager />
                <WatcherBridge />
              </OnboardingProvider>
            </ConfirmDialogProvider>
          </ToastProvider>
        </QueryProvider>
        </DensityProvider>
        </ThemeProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (window.electronAPI && window.electronAPI.isElectron) {
                document.documentElement.classList.add('electron-vibrancy');
              }
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function(registrations) {
                  for(let registration of registrations) {
                    registration.unregister();
                  }
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
