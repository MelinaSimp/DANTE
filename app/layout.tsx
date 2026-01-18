// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import PushNotificationManager from "@/components/PushNotificationManager";
import OfflineIndicator from "@/components/OfflineIndicator";
import { OnboardingProvider } from "@/components/onboarding/OnboardingProvider";
import { ErrorBoundary } from "@/components/ui/error-boundary";

export const metadata: Metadata = {
  title: "Drift - Agent Canvas",
  description: "Build and deploy AI agents with visual flows",
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
    <html lang="en">
      <body className="bg-[#242423] min-h-screen antialiased text-white">
        <OnboardingProvider>
          <OfflineIndicator />
          <div className="hidden">
            <Header />
          </div>
          <ErrorBoundary>
            <main className="relative z-0 bg-[#242423]" style={{ background: '#242423', backgroundImage: 'none' }}>{children}</main>
          </ErrorBoundary>
          <PushNotificationManager />
        </OnboardingProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Unregister all existing service workers to fix redirect issues
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function(registrations) {
                  for(let registration of registrations) {
                    registration.unregister().then(function(success) {
                      if (success) {
                        console.log('Service worker unregistered');
                      }
                    });
                  }
                });
              }
              
              // Service worker registration temporarily disabled
              // Re-enable after clearing all caches and cookies
            `,
          }}
        />
      </body>
    </html>
  );
}
