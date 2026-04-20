// app/layout.tsx
//
// Root layout. Ships the Harvey-inspired design language by default:
// white canvas, serif display type (Instrument Serif), sans UI (Inter),
// mono for data (JetBrains Mono). Individual legacy pages can still
// override to their own theme (e.g. /app agent canvas, /frontend orb)
// via useEffect — we only set a sensible default here.

import type { Metadata } from "next";
import { Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import PushNotificationManager from "@/components/PushNotificationManager";
import OfflineIndicator from "@/components/OfflineIndicator";
import { OnboardingProvider } from "@/components/onboarding/OnboardingProvider";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { ToastProvider } from "@/components/ui/toast";
import { ConfirmDialogProvider } from "@/components/ui/confirm-dialog";
// FloatingDashboardButton was removed in the IA sweep — every workspace
// page now has an inline "← Dashboard" link at the top, so the floating
// chip was a duplicate affordance. If you need one-off back-chip for a
// specific route, add it in that route, not globally.

const fontUi = Inter({
  subsets: ["latin"],
  variable: "--font-ui-loaded",
  display: "swap",
});
const fontDisplay = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
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
    >
      <body className="bg-white min-h-screen antialiased text-[#151515]">
        <ToastProvider>
          <ConfirmDialogProvider>
            <OnboardingProvider>
              <OfflineIndicator />
              <div className="hidden">
                <Header />
              </div>
              <ErrorBoundary>
                <main className="relative z-0 bg-white">{children}</main>
              </ErrorBoundary>
              <PushNotificationManager />
            </OnboardingProvider>
          </ConfirmDialogProvider>
        </ToastProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
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
